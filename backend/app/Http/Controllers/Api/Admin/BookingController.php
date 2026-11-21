<?php

namespace App\Http\Controllers\Api\Admin;

use App\Enums\BookingStatus;
use App\Enums\PaymentStatus;
use App\Http\Controllers\Controller;
use App\Http\Resources\AdminBookingResource;
use App\Models\Booking;
use App\Models\ParishSetting;
use App\Models\Service;
use App\Services\Booking\BookingAudit;
use App\Services\Booking\BookingNotifier;
use App\Services\Booking\BookingStateMachine;
use App\Services\Booking\CheckoutSessions;
use App\Services\PayMongo\PayMongoClient;
use App\Services\PayMongo\PayMongoException;
use App\Services\Register\CertificateRenderer;
use App\Services\Register\PrefilledCertificate;
use App\Support\ParishClock;
use App\Support\TextSearch;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class BookingController extends Controller
{
    public function __construct(private BookingStateMachine $bookings) {}

    public function index(Request $request)
    {
        $this->validateListFilters($request);
        $request->validate([
            'sacrament' => ['sometimes', 'string'],
            'priority' => ['sometimes'],
            'search' => ['sometimes', 'string', 'max:255'],
            'perPage' => ['sometimes', 'integer', 'between:1,100'],
            'from' => ['required_with:to', 'date_format:Y-m-d'],
            'to' => ['required_with:from', 'date_format:Y-m-d', 'after_or_equal:from'],
            'attention' => ['sometimes', 'in:overpaid'],
        ]);

        $query = Booking::with('user', 'creator', 'checkedInByUser', 'documentReviews.reviewer', 'registerEntry', 'milestoneTicks.doneByUser');

        $this->applyFilters($request, $query);

        if ($request->filled('sacrament')) {
            $query->whereIn('sacrament', $this->listParam($request, 'sacrament'));
        }

        if ($request->boolean('priority')) {
            return $this->paginatedByPriority($request, $query);
        }

        $bookings = $query->orderByDesc('created_at')->paginate($this->perPage($request))->withQueryString();

        return AdminBookingResource::collection($bookings);
    }

    /**
     * Per-sacrament counts for the Bookings Queue's category tabs, in one
     * grouped query instead of one paginated request per tab. Honors the same
     * status/search filters as index() so each badge always matches what
     * clicking that tab would list. `sacrament` is deliberately ignored (the
     * point is to count every category), and so is `priority`, which only
     * reorders index() and never narrows it.
     *
     * Every known sacrament is present in `bySacrament`, zero-filled, so the
     * client never has to guess whether a missing key means "0" or "unknown".
     */
    public function counts(Request $request)
    {
        $this->validateListFilters($request);
        $request->validate([
            'search' => ['sometimes', 'string', 'max:255'],
            'from' => ['required_with:to', 'date_format:Y-m-d'],
            'to' => ['required_with:from', 'date_format:Y-m-d', 'after_or_equal:from'],
            'attention' => ['sometimes', 'in:overpaid'],
        ]);

        $query = Booking::query();
        $this->applyFilters($request, $query);

        $grouped = $query
            ->selectRaw('sacrament, COUNT(*) as aggregate')
            ->groupBy('sacrament')
            ->pluck('aggregate', 'sacrament')
            ->map(fn ($n) => (int) $n);

        $bySacrament = [];
        foreach (Service::query()->orderBy('id')->pluck('id') as $sacrament) {
            $bySacrament[$sacrament] = $grouped[$sacrament] ?? 0;
        }

        return response()->json([
            'total' => $grouped->sum(),
            'bySacrament' => $bySacrament,
        ]);
    }

    /**
     * `status`, `paymentStatus` and `channel` each take one value or a comma-separated list
     * (`?status=submitted,approved`): the queue's multi-select filters. Every value must be a known one.
     */
    private function validateListFilters(Request $request): void
    {
        $known = [
            'status' => BookingStatus::values(),
            'paymentStatus' => PaymentStatus::values(),
            'channel' => ['online', 'walk_in'],
        ];
        $rules = [];
        foreach ($known as $key => $values) {
            $rules[$key] = ['sometimes', 'string'];
        }
        $request->validate($rules);
        foreach ($known as $key => $values) {
            if (! $request->filled($key)) {
                continue;
            }
            foreach ($this->listParam($request, $key) as $value) {
                if (! in_array($value, $values, true)) {
                    abort(response()->json([
                        'message' => "The selected {$key} is invalid.",
                        'errors' => [$key => ["The selected {$key} is invalid."]],
                    ], 422));
                }
            }
        }
    }

    /** @return list<string> */
    private function listParam(Request $request, string $key): array
    {
        return array_values(array_filter(array_map('trim', explode(',', $request->string($key)->toString())), fn ($v) => $v !== ''));
    }

    private function perPage(Request $request): int
    {
        return $request->integer('perPage', 15);
    }

    /**
     * Filters shared by index() and counts(). Without a status filter the
     * queue leaves out drafts (an unsubmitted draft is the parishioner's
     * private work in progress), unless staff are searching: a draft's
     * reference number read over the phone must be findable.
     * `?status=draft` still lists them on request.
     */
    private function applyFilters(Request $request, $query): void
    {
        if ($request->filled('status')) {
            $query->whereIn('status', $this->listParam($request, 'status'));
        } elseif (! $request->filled('search')) {
            $query->where('status', '!=', BookingStatus::Draft->value);
        }

        if ($request->filled('search')) {
            $this->applySearch($query, $request->string('search')->toString());
        }
        if ($request->filled('paymentStatus')) {
            $query->whereIn('payment_status', $this->listParam($request, 'paymentStatus'));
        }
        if ($request->filled('channel')) {
            $query->whereIn('channel', $this->listParam($request, 'channel'));
        }
        if ($request->filled('from') && $request->filled('to')) {
            $query->inReportRange($request->string('from')->toString(), $request->string('to')->toString());
        }
        if ($request->input('attention') === 'overpaid') {
            $query->where('payment_status', 'paid')->whereNotNull('amount_paid_centavos')
                ->whereRaw('amount_paid_centavos - amount_refunded_centavos - COALESCE(amount_due_centavos, 0) > 0');
        }
    }

    /** Emergency → urgent sacraments → soonest appointment (undated last) → oldest request. */
    private function paginatedByPriority(Request $request, $query)
    {
        $placeholders = implode(',', array_fill(0, count(Booking::PRIORITY_SACRAMENTS), '?'));

        $bookings = $query
            ->orderByDesc('is_emergency')
            ->orderByRaw("CASE WHEN sacrament IN ({$placeholders}) THEN 0 ELSE 1 END", Booking::PRIORITY_SACRAMENTS)
            ->orderByRaw('CASE WHEN appointment_date IS NULL THEN 1 ELSE 0 END')
            ->orderBy('appointment_date')
            ->orderBy('appointment_start')
            ->orderBy('created_at')
            ->paginate($this->perPage($request))
            ->withQueryString();

        return AdminBookingResource::collection($bookings);
    }

    /**
     * "search" (item 16) is an AND against whatever status/sacrament/priority
     * filters are already applied — wrapped in its own closure so the OR
     * between reference-number/name/email stays isolated from the rest of
     * the query. Matches case-insensitively, on a partial string, and across
     * Ñ/accented letters via App\Support\TextSearch (SQLite's LOWER() folds
     * only ASCII; MySQL's collation already ignores case).
     */
    private function applySearch($query, string $term): void
    {
        $term = trim($term);
        if ($term === '') return;

        $query->where(function ($q) use ($term) {
            TextSearch::orContains($q, 'reference_number', $term);
            $q->orWhereHas('user', fn ($u) => $u->where(function ($n) use ($term) {
                TextSearch::orContains($n, 'full_name', $term);
                TextSearch::orContains($n, 'email', $term);
            }));
            // A booking whose owner account was deleted keeps the owner in owner_snapshot; search it too.
            TextSearch::orContains($q, "JSON_EXTRACT(owner_snapshot, '$.fullName')", $term);
            TextSearch::orContains($q, "JSON_EXTRACT(owner_snapshot, '$.email')", $term);
        });
    }

    public function show(Request $request, string $id)
    {
        $booking = Booking::with('checkedInByUser')->findOrFail($id);

        return new AdminBookingResource($booking);
    }

    public function approve(Request $request, string $id)
    {
        return $this->respond($this->bookings->approve(Booking::findOrFail($id), $request->user()));
    }

    public function decline(Request $request, string $id)
    {
        $request->validate(['reason' => ['required', 'string', 'max:500']]);

        return $this->respond($this->bookings->decline(Booking::findOrFail($id), $request->user(), $request->string('reason')->toString()));
    }

    public function returnForChanges(Request $request, string $id)
    {
        $request->validate(['note' => ['nullable', 'string', 'max:1000']]);

        return $this->respond($this->bookings->returnForChanges(Booking::findOrFail($id), $request->user(), $request->input('note')));
    }

    public function history(string $id)
    {
        Booking::findOrFail($id);

        return \App\Http\Resources\AuditLogResource::collection(
            \App\Models\AuditLog::with('actor')->where('subject_type', 'booking')->where('subject_id', $id)
                ->orderBy('created_at')->orderBy('id')->get(),
        )->resolve();
    }

    public function cancel(Request $request, string $id)
    {
        $request->validate(['reason' => ['required', 'string', 'max:500']]);

        return $this->respond($this->bookings->cancel(Booking::findOrFail($id), $request->user(), $request->string('reason')->toString()));
    }

    public function checkIn(Request $request, string $id)
    {
        return $this->respond($this->bookings->checkIn(Booking::findOrFail($id), $request->user()));
    }

    /** The booking behind a reference typed or scanned at the desk (any letter case, stray spaces ignored). */
    public function byReference(string $reference)
    {
        $booking = Booking::with('user')->whereRaw('LOWER(reference_number) = ?', [mb_strtolower(trim($reference))])->first();
        if ($booking === null) {
            return response()->json(['message' => 'No booking with that reference.'], 404);
        }

        return new AdminBookingResource($booking);
    }

    public function complete(Request $request, string $id)
    {
        return $this->respond($this->bookings->complete(Booking::findOrFail($id), $request->user()));
    }

    public function reschedule(Request $request, string $id)
    {
        $request->validate([
            'appointmentDate' => ['required', 'date_format:Y-m-d'],
            'appointmentStart' => ['required', 'date_format:H:i'],
            'reason' => ['required', 'string', 'max:500'],
            'waiveLeadTime' => ['sometimes', 'boolean'],
        ]);

        return $this->respond($this->bookings->rescheduleByStaff(
            Booking::findOrFail($id), $request->user(),
            $request->string('appointmentDate')->toString(), $request->string('appointmentStart')->toString(),
            $request->string('reason')->toString(), $request->boolean('waiveLeadTime'),
        ));
    }

    public function partialRefund(Request $request, string $id)
    {
        $request->validate([
            'reference' => ['required', 'string', 'max:120'],
            'amountCentavos' => ['required', 'integer', 'min:1'],
        ]);

        return $this->respond($this->bookings->recordPartialRefund(
            Booking::findOrFail($id), $request->user(), $request->string('reference')->toString(), $request->integer('amountCentavos'),
        ));
    }

    public function refund(Request $request, string $id)
    {
        $request->validate([
            'reference' => ['required', 'string', 'max:120'],
            'note' => ['nullable', 'string', 'max:500'],
        ]);

        return $this->respond($this->bookings->markRefunded(
            Booking::findOrFail($id), $request->user(),
            $request->string('reference')->toString(), $request->input('note'),
        ));
    }

    /** Cash taken at the counter for a booking whose owner chose to pay at the parish office; the receipt number is optional. */
    public function cashReceived(Request $request, string $id)
    {
        $request->validate(['receiptReference' => ['nullable', 'string', 'max:120']]);
        $reference = trim((string) $request->input('receiptReference', ''));

        return $this->respond($this->bookings->markCashReceived(
            Booking::findOrFail($id), $request->user(), $reference !== '' ? $reference : null,
        ));
    }

    /**
     * The GCash checkout link for an unpaid booking (spec §5.4), so staff can
     * show a walk-in the QR at the counter or resend it to someone who lost it.
     * Same guards as the parishioner's own payment route, any owner.
     */
    public function paymentLink(string $id, CheckoutSessions $sessions, PayMongoClient $paymongo)
    {
        $booking = Booking::findOrFail($id);

        if ($booking->payment_status === PaymentStatus::Paid) {
            return response()->json(['message' => 'This booking has already been paid.'], 409);
        }
        $holdLapsed = in_array($booking->status, [BookingStatus::Submitted, BookingStatus::Approved], true)
            && $booking->payment_status?->awaitingPayment()
            && ! $booking->payment_hold_expires_at?->isFuture();
        if ($holdLapsed) {
            return response()->json([
                'message' => 'The payment window for this booking has closed, so its time is no longer held. Please make a new booking.',
            ], 422);
        }

        $payable = in_array($booking->status, [BookingStatus::Submitted, BookingStatus::Returned, BookingStatus::Approved], true)
            && $booking->payment_status?->awaitingPayment()
            && ($booking->status === BookingStatus::Returned || $booking->payment_hold_expires_at?->isFuture());
        if (! $payable) {
            return response()->json(['message' => 'This booking has no payment due.'], 422);
        }
        if (! $paymongo->isConfigured()) {
            Log::warning('PayMongo payment link requested but PAYMONGO_SECRET_KEY is not set.', ['booking' => $booking->id]);

            return response()->json(['message' => 'GCash payments are not available right now. Please try again later.'], 503);
        }

        try {
            $session = $sessions->for($booking);
        } catch (PayMongoException $e) {
            Log::error('PayMongo checkout session creation failed.', ['booking' => $booking->id, 'error' => $e->getMessage()]);

            return response()->json(['message' => "We couldn't create the GCash payment link. Please try again in a moment."], 502);
        }

        return response()->json(['checkoutUrl' => $session['checkout_url'], 'checkoutSessionId' => $session['id']]);
    }

    private function respond(Booking $booking): AdminBookingResource
    {
        return new AdminBookingResource($booking->load('user', 'checkedInByUser'));
    }

    public function downloadCertificate(string $id, CertificateRenderer $certificates, PrefilledCertificate $prefilled)
    {
        $booking = Booking::findOrFail($id);
        $entry = $booking->registerEntry;
        $html = $entry ? $certificates->html($entry) : $prefilled->html($booking, forOffice: true);

        if ($html === null) {
            return response()->json(['message' => 'No certificate yet.'], 404);
        }

        return response($html, 200, ['Content-Type' => 'text/html', 'Cache-Control' => 'no-store']);
    }
}
