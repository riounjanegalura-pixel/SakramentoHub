<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\CertificateRequest;
use App\Models\Donation;
use App\Models\ParishSetting;
use App\Models\Service;
use App\Services\AuditTrail;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use OpenSpout\Common\Entity\Cell;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Common\Entity\Style\Border;
use OpenSpout\Common\Entity\Style\BorderName;
use OpenSpout\Common\Entity\Style\BorderPart;
use OpenSpout\Common\Entity\Style\BorderStyle;
use OpenSpout\Common\Entity\Style\BorderWidth;
use OpenSpout\Common\Entity\Style\CellAlignment;
use OpenSpout\Common\Entity\Style\CellVerticalAlignment;
use OpenSpout\Common\Entity\Style\Color;
use OpenSpout\Common\Entity\Style\Style;
use OpenSpout\Writer\XLSX\Entity\SheetView;
use OpenSpout\Writer\XLSX\Options;
use OpenSpout\Writer\XLSX\Writer;

class ReportController extends Controller
{
    private const HEADER = ['Reference', 'Service', 'For', 'Contact', 'Phone', 'Email', 'Date', 'Start', 'End', 'Status', 'Payment', 'Fee', 'Paid', 'Channel', 'Requested'];

    public function summary(Request $request)
    {
        [$from, $to, $sacrament] = $this->range($request);
        $bookings = $this->query($from, $to, $sacrament)->get(['id', 'sacrament', 'status', 'channel', 'is_emergency', 'appointment_date', 'created_at']);

        $services = Service::orderBy('id')->when($sacrament, fn ($q) => $q->whereKey($sacrament))->get(['id', 'name']);
        $bySacrament = $services->map(function (Service $s) use ($bookings) {
            $rows = $bookings->where('sacrament', $s->id);

            return ['sacrament' => $s->id, 'name' => $s->name, 'total' => $rows->count(),
                'byStatus' => (object) $rows->countBy(fn (Booking $b) => $b->status->value)->all()];
        })->values();

        $tz = config('app.parish_timezone');
        $startUtc = CarbonImmutable::parse($from, $tz)->startOfDay()->utc();
        $endUtc = CarbonImmutable::parse($to, $tz)->endOfDay()->utc();
        $scoped = fn ($q) => $q->when($sacrament, fn ($x) => $x->where('sacrament', $sacrament));
        $withStatus = fn (string $status) => $bookings->filter(fn (Booking $b) => $b->status->value === $status)->count();

        $refunded = AuditLog::whereIn('action', ['booking.refunded', 'booking.partial_refund'])
            ->where('subject_type', 'booking')->whereBetween('created_at', [$startUtc, $endUtc])
            ->when($sacrament, fn ($q) => $q->whereIn('subject_id', Booking::where('sacrament', $sacrament)->select('id')))
            ->get()->sum(fn (AuditLog $row) => (int) ($row->metadata['amountCentavos'] ?? 0));

        // What the office still owes back today, not bounded by the range.
        $refundDue = $scoped(Booking::where('payment_status', 'refund_due'))->get()
            ->sum(fn (Booking $b) => max(0, (int) ($b->amount_paid_centavos ?? $b->amount_due_centavos ?? 0) - (int) $b->amount_refunded_centavos));
        $overpaid = $scoped(Booking::where('payment_status', 'paid')->whereNotNull('amount_paid_centavos'))->get()
            ->sum(fn (Booking $b) => $b->overpaidCentavos());

        return response()->json([
            'range' => ['from' => $from, 'to' => $to],
            'totals' => [
                'bookings' => $bookings->count(),
                'completed' => $withStatus('completed'),
                'declined' => $withStatus('declined'),
                'cancelled' => $withStatus('cancelled'),
                'online' => $bookings->where('channel', '!=', 'walk_in')->count(),
                'walkIn' => $bookings->where('channel', 'walk_in')->count(),
                'urgent' => $bookings->where('is_emergency', true)->count(),
            ],
            'bySacrament' => $bySacrament,
            'money' => [
                'collectedCentavos' => (int) $scoped(Booking::whereBetween('paid_at', [$startUtc, $endUtc]))->sum('amount_paid_centavos'),
                'refundedCentavos' => (int) $refunded,
                'refundDueCentavos' => (int) $refundDue,
                'overpaidCentavos' => (int) $overpaid,
            ],
            ...$this->trends($bookings, $from, $to, $sacrament),
        ]);
    }

    /**
     * Per-month series (bookings by status, gifts, certificates), bookings per weekday, and the same headline numbers
     * for the period of equal length right before this one. Months and weekdays are Manila calendar days.
     *
     * @return array<string, mixed>
     */
    private function trends($bookings, string $from, string $to, ?string $sacrament): array
    {
        $tz = config('app.parish_timezone');
        $dayOf = fn (Booking $b): string => $b->appointment_date
            ? CarbonImmutable::parse($b->appointment_date)->format('Y-m-d')
            : $b->created_at->setTimezone($tz)->format('Y-m-d');

        $gifts = $this->gifts($from, $to);
        $certs = $this->certificates($from, $to);

        $monthly = [];
        for ($m = CarbonImmutable::parse($from)->startOfMonth(), $end = CarbonImmutable::parse($to); $m <= $end; $m = $m->addMonth()) {
            $key = $m->format('Y-m');
            $rows = $bookings->filter(fn (Booking $b) => str_starts_with($dayOf($b), $key));
            $monthly[] = [
                'month' => $key,
                'bookings' => $rows->count(),
                'byStatus' => (object) $rows->countBy(fn (Booking $b) => $b->status->value)->all(),
                'donationsCentavos' => (int) $gifts->filter(fn ($g) => $g->paid_at->setTimezone($tz)->format('Y-m') === $key)->sum('amount_centavos'),
                'certificatesIssued' => $certs->filter(fn ($c) => $c->closed_at->setTimezone($tz)->format('Y-m') === $key)->count(),
            ];
        }

        $weekdays = array_fill(0, 7, 0); // Monday first
        foreach ($bookings as $b) {
            $weekdays[CarbonImmutable::parse($dayOf($b))->dayOfWeekIso - 1]++;
        }

        $days = CarbonImmutable::parse($from)->diffInDays(CarbonImmutable::parse($to)) + 1;
        $prevTo = CarbonImmutable::parse($from)->subDay();
        $prevFrom = $prevTo->subDays($days - 1);
        $prevFromS = $prevFrom->format('Y-m-d');
        $prevToS = $prevTo->format('Y-m-d');
        $prev = $this->query($prevFromS, $prevToS, $sacrament)->get(['id', 'status']);

        return [
            'monthly' => $monthly,
            'byWeekday' => $weekdays,
            'donations' => ['totalCentavos' => (int) $gifts->sum('amount_centavos'), 'count' => $gifts->count()],
            'certificates' => ['issued' => $certs->count()],
            'previous' => [
                'range' => ['from' => $prevFromS, 'to' => $prevToS],
                'bookings' => $prev->count(),
                'completed' => $prev->filter(fn (Booking $b) => $b->status->value === 'completed')->count(),
                'donationsCentavos' => (int) $this->gifts($prevFromS, $prevToS)->sum('amount_centavos'),
                'certificatesIssued' => $this->certificates($prevFromS, $prevToS)->count(),
            ],
        ];
    }

    private function gifts(string $from, string $to)
    {
        [$a, $b] = $this->bounds($from, $to);

        return Donation::where('status', 'paid')->whereBetween('paid_at', [$a, $b])->get(['amount_centavos', 'paid_at']);
    }

    private function certificates(string $from, string $to)
    {
        [$a, $b] = $this->bounds($from, $to);

        return CertificateRequest::where('status', 'issued')->whereBetween('closed_at', [$a, $b])->get(['closed_at']);
    }

    /** @return array{0: CarbonImmutable, 1: CarbonImmutable} */
    private function bounds(string $from, string $to): array
    {
        $tz = config('app.parish_timezone');

        return [CarbonImmutable::parse($from, $tz)->startOfDay()->utc(), CarbonImmutable::parse($to, $tz)->endOfDay()->utc()];
    }

    public function csv(Request $request, AuditTrail $audit)
    {
        [$from, $to, $sacrament] = $this->range($request);
        $bookings = $this->query($from, $to, $sacrament)->with('user', 'service')
            ->orderByRaw('CASE WHEN appointment_date IS NULL THEN 1 ELSE 0 END')->orderBy('appointment_date')->orderBy('appointment_start')->orderBy('created_at')->get();

        $audit->record($request->user(), 'report.exported', 'report', 'bookings', ['from' => $from, 'to' => $to, 'sacrament' => $sacrament, 'rows' => $bookings->count()]);

        $tz = config('app.parish_timezone');
        $money = fn (?int $centavos) => $centavos === null ? '' : number_format($centavos / 100, 2, '.', '');

        return response()->streamDownload(function () use ($bookings, $tz, $money) {
            $out = fopen('php://output', 'w');
            fwrite($out, "\xEF\xBB\xBF"); // so Excel reads ñ and é correctly
            fputcsv($out, self::HEADER);
            foreach ($bookings as $b) {
                fputcsv($out, array_map($this->safeCell(...), [
                    $b->reference_number, $b->service?->name ?? $b->sacrament, $b->subjectName(), (string) $b->ownerName(),
                    $this->phoneCell((string) $b->contactPhone()), (string) $b->ownerEmail(), (string) $b->appointmentDateString(),
                    (string) $b->appointment_start, (string) $b->appointment_end, $b->status->label(),
                    $b->payment_status?->label() ?? '', $money($b->amount_due_centavos), $money($b->amount_paid_centavos),
                    $b->channel === 'walk_in' ? 'Walk-in' : 'Online', $b->created_at->setTimezone($tz)->format('Y-m-d H:i'),
                ]));
            }
            fclose($out);
        }, "bookings-{$from}-to-{$to}.csv", ['Content-Type' => 'text/csv; charset=UTF-8']);
    }

    /**
     * A Philippine mobile number as "0961 622 5451". Written as bare digits, Excel reads it as a number and shows
     * 9.61E+09 with the leading zero gone; the spaces keep it text. Anything else is left as it was entered.
     */
    private function phoneCell(string $phone): string
    {
        $digits = preg_replace('/[\s-]+/', '', $phone);

        return preg_match('/^09\d{9}$/', (string) $digits) ? substr($digits, 0, 4).' '.substr($digits, 4, 3).' '.substr($digits, 7) : $phone;
    }

    /**
     * The same report as a designed Excel workbook: a Summary sheet (the headline numbers, the money, bookings by
     * sacrament) and a Register sheet (every booking), with real column widths so dates never show as #######.
     * The CSV above stays for anyone who wants the plain data.
     */
    public function xlsx(Request $request, AuditTrail $audit)
    {
        [$from, $to, $sacrament] = $this->range($request);
        $summary = $this->summary($request)->getData(true);
        $bookings = $this->query($from, $to, $sacrament)->with('user', 'service')
            ->orderByRaw('CASE WHEN appointment_date IS NULL THEN 1 ELSE 0 END')->orderBy('appointment_date')->orderBy('appointment_start')->orderBy('created_at')->get();

        $audit->record($request->user(), 'report.exported', 'report', 'bookings', ['from' => $from, 'to' => $to, 'sacrament' => $sacrament, 'rows' => $bookings->count(), 'format' => 'xlsx']);

        $tz = config('app.parish_timezone');
        $parish = ParishSetting::parishName();

        return response()->streamDownload(function () use ($summary, $bookings, $tz, $parish, $from, $to) {
            $navy = '1F2A44';
            $paper = 'F3EEE2';
            $line = new Border(...array_map(fn (BorderName $n) => new BorderPart($n, 'DDD6C4', BorderWidth::THIN, BorderStyle::SOLID), [BorderName::BOTTOM]));

            $title = (new Style())->withFontSize(18)->withFontBold(true)->withFontColor($navy);
            $sub = (new Style())->withFontSize(11)->withFontColor('6B6B6B');
            $head = (new Style())->withFontBold(true)->withFontColor(Color::WHITE)->withBackgroundColor($navy)->withCellVerticalAlignment(CellVerticalAlignment::CENTER);
            $section = (new Style())->withFontBold(true)->withFontSize(12)->withFontColor($navy)->withBackgroundColor($paper);
            $label = (new Style())->withBorder($line);
            $number = (new Style())->withBorder($line)->withCellAlignment(CellAlignment::RIGHT)->withFormat('#,##0');
            $money = (new Style())->withBorder($line)->withCellAlignment(CellAlignment::RIGHT)->withFormat('"₱"#,##0.00');
            $cell = (new Style())->withBorder($line);
            $cellRight = (new Style())->withBorder($line)->withCellAlignment(CellAlignment::RIGHT);

            // One set of column widths serves both sheets, so the Summary leans on A and B and the Register uses A to O.
            $options = new Options();
            foreach ([24, 22, 22, 22, 16, 28, 13, 8, 8, 17, 13, 11, 11, 11, 17] as $i => $w) {
                $options->setColumnWidth($w, $i + 1);
            }
            $options->mergeCells(0, 1, 5, 1, 0);
            $options->mergeCells(0, 2, 5, 2, 0);

            $writer = new Writer($options);
            $writer->openToFile('php://output');
            $writer->getCurrentSheet()->setName('Summary');

            $writer->addRow(Row::fromValuesWithStyle([$parish.' — Bookings report'], $title, 30));
            $writer->addRow(Row::fromValuesWithStyle([CarbonImmutable::parse($from)->format('M j, Y').' to '.CarbonImmutable::parse($to)->format('M j, Y').'  ·  made '.now($tz)->format('M j, Y H:i')], $sub, 20));
            $writer->addRow(Row::fromValues([]));

            $block = function (string $heading, array $rows, Style $valueStyle) use ($writer, $section, $label) {
                $writer->addRow(Row::fromValuesWithStyle([$heading, ''], $section, 22));
                foreach ($rows as [$name, $value]) {
                    $writer->addRow(new Row([Cell::fromValue($name, $label), Cell::fromValue($value, $valueStyle)]));
                }
                $writer->addRow(Row::fromValues([]));
            };

            $t = $summary['totals'];
            $block('Summary', [
                ['Bookings', $t['bookings']], ['Completed', $t['completed']], ['Certificates issued', $summary['certificates']['issued'] ?? 0],
                ['Declined', $t['declined']], ['Cancelled', $t['cancelled']], ['Online', $t['online']], ['Walk-in', $t['walkIn']], ['Urgent', $t['urgent']],
            ], $number);

            $m = $summary['money'];
            $block('Money', [
                ['Fees collected', $m['collectedCentavos'] / 100], ['Refunded in this range', $m['refundedCentavos'] / 100],
                ['Refunds still due', $m['refundDueCentavos'] / 100], ['Overpaid, to refund', $m['overpaidCentavos'] / 100],
                ['Gifts received', ($summary['donations']['totalCentavos'] ?? 0) / 100],
            ], $money);

            $block('Bookings by sacrament', array_map(fn ($r) => [$r['name'], $r['total']], $summary['bySacrament']), $number);

            $sheet = $writer->addNewSheetAndMakeItCurrent();
            $sheet->setName('Register');
            $sheet->setSheetView(new SheetView(freezeRow: 2)); // the header row stays in view while scrolling
            $writer->addRow(Row::fromValuesWithStyle(self::HEADER, $head, 24));
            foreach ($bookings as $b) {
                $values = [
                    $b->reference_number, $b->service?->name ?? $b->sacrament, $b->subjectName(), (string) $b->ownerName(),
                    (string) $b->contactPhone(), (string) $b->ownerEmail(), (string) $b->appointmentDateString(),
                    (string) $b->appointment_start, (string) $b->appointment_end, $b->status->label(),
                    $b->payment_status?->label() ?? '', ($b->amount_due_centavos ?? 0) / 100, $b->amount_paid_centavos === null ? '' : $b->amount_paid_centavos / 100,
                    $b->channel === 'walk_in' ? 'Walk-in' : 'Online', $b->created_at->setTimezone($tz)->format('Y-m-d H:i'),
                ];
                $cells = [];
                foreach ($values as $i => $v) {
                    $cells[] = Cell::fromValue(is_string($v) ? $this->plainCell($v) : $v, in_array($i, [11, 12], true) ? $money : $cell);
                }
                $writer->addRow(new Row($cells));
            }

            $writer->close();
        }, "bookings-{$from}-to-{$to}.xlsx", ['Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
    }

    /** In an Excel file a text cell is text, so a phone keeps its leading zero; still defuse anything that reads as a formula. */
    private function plainCell(string $value): string
    {
        return $this->safeCell($value);
    }

    /** A cell a spreadsheet would run as a formula is turned into plain text (CSV injection). */
    private function safeCell(string $value): string
    {
        $visible = ltrim($value, " \t\r\n"); // a spreadsheet ignores leading whitespace before a formula

        return $value !== '' && (in_array($value[0], ["\t", "\r"], true) || ($visible !== '' && in_array($visible[0], ['=', '+', '-', '@'], true))) ? "'".$value : $value;
    }

    private function query(string $from, string $to, ?string $sacrament)
    {
        return Booking::query()->inReportRange($from, $to)->when($sacrament, fn ($q) => $q->where('sacrament', $sacrament));
    }

    /** @return array{0: string, 1: string, 2: ?string} */
    private function range(Request $request): array
    {
        $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
            'sacrament' => ['sometimes', 'nullable', Rule::exists('services', 'id')],
        ]);
        $from = $request->string('from')->toString();
        $to = $request->string('to')->toString();
        abort_if(CarbonImmutable::parse($from)->diffInDays(CarbonImmutable::parse($to)) > 366, 422, 'A report may cover at most one year.');

        return [$from, $to, $request->input('sacrament') ?: null];
    }
}
