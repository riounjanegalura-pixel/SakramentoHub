<?php

namespace App\Http\Controllers\Api\Admin;

use App\Enums\PaymentStatus;
use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\CertificateRequest;
use App\Models\Donation;
use App\Models\Service;
use App\Support\ParishClock;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class AnalyticsController extends Controller
{
    public function index(Request $request)
    {
        $byStatus = Booking::query()
            ->where('status', '!=', 'draft')
            ->selectRaw('status, count(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status');

        $bySacrament = Booking::query()
            ->where('status', '!=', 'draft')
            ->selectRaw('sacrament, count(*) as count')
            ->groupBy('sacrament')
            ->pluck('count', 'sacrament');

        $last7Days = Booking::where('status', '!=', 'draft')->where('created_at', '>=', Carbon::now()->subDays(7))->count();
        $last30Days = Booking::where('status', '!=', 'draft')->where('created_at', '>=', Carbon::now()->subDays(30))->count();

        return response()->json([
            'byStatus' => $byStatus,
            'bySacrament' => $bySacrament,
            'createdLast7Days' => $last7Days,
            'createdLast30Days' => $last30Days,
            // Gifts paid through GCash (the webhook marks them paid); pending and abandoned ones are not counted.
            'donations' => [
                'totalCentavos' => (int) Donation::where('status', 'paid')->sum('amount_centavos'),
                'count' => Donation::where('status', 'paid')->count(),
            ],
            'attention' => [
                'awaitingReview' => Booking::where('status', 'submitted')->count(),
                'urgentOpen' => Booking::where('is_emergency', true)->whereIn('status', ['submitted', 'returned', 'approved'])->count(),
                'refundDue' => Booking::where('payment_status', 'refund_due')->count(),
                'overpaid' => Booking::where('payment_status', 'paid')->whereNotNull('amount_paid_centavos')
                    ->whereRaw('amount_paid_centavos - amount_refunded_centavos - COALESCE(amount_due_centavos, 0) > 0')->count(),
                'todayAppointments' => Booking::holdingSlot()->whereDate('appointment_date', ParishClock::todayString())->count(),
                // Every hold that lapses when unpaid: GCash not yet paid, or cash at the office not yet taken.
                'holdsExpiringSoon' => Booking::where('status', 'submitted')->whereIn('payment_status', PaymentStatus::awaitingValues())
                    ->where('payment_hold_expires_at', '>', now())->where('payment_hold_expires_at', '<=', now()->addHours(12))->count(),
                'certificateRequests' => CertificateRequest::open()->count(),
            ],
            'visitsAhead' => $this->visitsAhead(),
            'bookingsPerDay' => $this->bookingsPerDay(),
            'waitingPreview' => $this->waitingPreview(),
            'dueSoon' => $this->dueSoon(),
        ]);
    }

    /** Appointments that hold a slot on each of the next 14 parish days, starting tomorrow; every day is listed, zero included. */
    private function visitsAhead(): array
    {
        $first = ParishClock::today()->addDay();
        $dates = collect(range(0, 13))->map(fn (int $i) => $first->addDays($i)->toDateString());

        $counts = Booking::holdingSlot()
            ->whereBetween('appointment_date', [$dates->first(), $dates->last()])
            ->pluck('appointment_date')
            ->countBy(fn ($d) => substr((string) $d, 0, 10));

        return $dates->map(fn (string $d) => ['date' => $d, 'count' => (int) $counts->get($d, 0)])->all();
    }

    /** Bookings created per parish day for the last 14 days, ending today; drafts are left out, zero days are listed. */
    private function bookingsPerDay(): array
    {
        $first = ParishClock::today()->subDays(13);
        $dates = collect(range(0, 13))->map(fn (int $i) => $first->addDays($i)->toDateString());
        $tz = config('app.parish_timezone', 'Asia/Manila');

        $counts = Booking::where('status', '!=', 'draft')
            ->where('created_at', '>=', $first)
            ->pluck('created_at')
            ->countBy(fn ($at) => Carbon::parse($at)->setTimezone($tz)->toDateString());

        return $dates->map(fn (string $d) => ['date' => $d, 'count' => (int) $counts->get($d, 0)])->all();
    }

    /**
     * Up to three bookings that need the priest next: the hold that ends soonest, the request that has waited longest,
     * then a refund that is due. The Dashboard words each one; the amounts and times stay data.
     */
    private function waitingPreview(): array
    {
        $item = fn (Booking $b, string $kind, array $extra = []) => [
            'kind' => $kind, 'bookingId' => $b->id, 'subjectName' => $b->subjectName(), 'sacrament' => $b->sacrament,
        ] + $extra;

        $out = collect();
        $hold = Booking::where('status', 'submitted')->whereIn('payment_status', PaymentStatus::awaitingValues())
            ->where('payment_hold_expires_at', '>', now())->where('payment_hold_expires_at', '<=', now()->addHours(12))
            ->orderBy('payment_hold_expires_at')->first();
        if ($hold) {
            $out->push($item($hold, 'hold', ['holdExpiresAt' => Carbon::parse($hold->payment_hold_expires_at)->toISOString()]));
        }

        $reviews = Booking::where('status', 'submitted')->orderBy('created_at')->limit(4)->get();
        $firstReview = $reviews->first(fn (Booking $b) => $b->id !== $hold?->id);
        if ($firstReview) {
            $out->push($item($firstReview, 'review', ['submittedAt' => $firstReview->created_at->toISOString()]));
        }

        $refund = Booking::where('payment_status', 'refund_due')->orderBy('updated_at')->first();
        if ($refund) {
            $out->push($item($refund, 'refund', ['refundCentavos' => max(0, (int) $refund->amount_paid_centavos - (int) $refund->amount_refunded_centavos)]));
        }

        // Top up to three with the next requests that have waited longest.
        foreach ($reviews as $b) {
            if ($out->count() >= 3) {
                break;
            }
            if (! $out->contains(fn (array $o) => $o['bookingId'] === $b->id)) {
                $out->push($item($b, 'review', ['submittedAt' => $b->created_at->toISOString()]));
            }
        }

        return $out->take(3)->values()->all();
    }

    /**
     * Visits that fall due in the next two days, today included, soonest first (the priest's own reminder list).
     * A visit that already happened is left out; a hold that has lapsed no longer holds its slot, so it is not listed either.
     *
     * @return list<array{bookingId: string, subjectName: string, service: string, date: string, start: ?string, paymentStatus: ?string}>
     */
    private function dueSoon(): array
    {
        $names = Service::pluck('name', 'id');
        $today = ParishClock::today();

        return Booking::holdingSlot()
            ->where('status', '!=', 'completed')
            ->whereBetween('appointment_date', [$today->toDateString(), $today->addDays(2)->toDateString()])
            ->orderBy('appointment_date')->orderBy('appointment_start')
            ->limit(8)->get()
            ->map(fn (Booking $b) => [
                'bookingId' => $b->id,
                'subjectName' => $b->subjectName(),
                'service' => $names[$b->sacrament] ?? ucfirst($b->sacrament),
                'date' => substr((string) $b->appointment_date, 0, 10),
                'start' => $b->appointment_start ? substr((string) $b->appointment_start, 0, 5) : null,
                'paymentStatus' => $b->payment_status instanceof \BackedEnum ? $b->payment_status->value : $b->payment_status,
            ])->values()->all();
    }
}
