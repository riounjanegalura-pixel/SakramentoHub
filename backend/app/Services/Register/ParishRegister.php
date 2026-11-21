<?php

namespace App\Services\Register;

use App\Exceptions\BookingRuleViolation;
use App\Models\Booking;
use App\Models\ParishSetting;
use App\Models\RegisterEntry;
use App\Models\User;
use App\Services\AuditTrail;
use App\Support\ParishClock;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/** Numbering, recording, correcting and revoking the parish's register entries. */
final class ParishRegister
{
    public const PREFIXES = ['baptism' => 'BAP', 'confirmation' => 'CON', 'wedding' => 'MAR', 'funeral' => 'DEA', 'anointing' => 'ANO', 'house-blessing' => 'BLS'];

    public const LABELS = ['baptism' => 'Baptism', 'confirmation' => 'Confirmation', 'wedding' => 'Marriage', 'funeral' => 'Death', 'anointing' => 'Anointing of the Sick', 'house-blessing' => 'Blessing'];

    public const CANONICAL = ['baptism', 'confirmation', 'wedding', 'funeral'];

    /** No 0/O or 1/I/L: a code read off paper must not be ambiguous. */
    public const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

    public function __construct(private AuditTrail $audit) {}

    public static function prefix(string $sacrament): string
    {
        return self::PREFIXES[$sacrament] ?? 'SVC';
    }

    public static function label(string $sacrament): string
    {
        return self::LABELS[$sacrament] ?? 'Service';
    }

    /** @return array{sequence: int, number: string} */
    public function nextNumber(string $sacrament, int $year): array
    {
        if (DB::transactionLevel() === 0) {
            throw new \LogicException('nextNumber must run inside a transaction.');
        }
        // Write first: the increment takes the write lock on SQLite and the row lock on MySQL.
        DB::table('register_sequences')->insertOrIgnore(['sacrament' => $sacrament, 'year' => $year, 'last_number' => 0]);
        DB::table('register_sequences')->where('sacrament', $sacrament)->where('year', $year)->increment('last_number');
        $sequence = (int) DB::table('register_sequences')->where('sacrament', $sacrament)->where('year', $year)->value('last_number');

        return ['sequence' => $sequence, 'number' => sprintf('%s-%d-%04d', self::prefix($sacrament), $year, $sequence)];
    }

    /**
     * Idempotent: a booking has at most one entry, and a second call returns it.
     * $fixedCode is for the demo seeder alone: the code is then derived from the reference, so it is predictable.
     */
    public function record(Booking $booking, ?User $by, ?string $ceremonyDate = null, bool $fixedCode = false): RegisterEntry
    {
        return DB::transaction(function () use ($booking, $by, $ceremonyDate, $fixedCode) {
            if ($existing = RegisterEntry::where('booking_id', $booking->id)->first()) {
                return $existing;
            }

            // $ceremonyDate is for the backfill of an emergency anointing: its completion day, not today.
            $date = $booking->appointmentDateString() ?? $ceremonyDate ?? ParishClock::todayString();
            $year = (int) substr($date, 0, 4);
            $snapshot = CertificateContent::snapshotFor($booking, $date);
            ['sequence' => $sequence, 'number' => $number] = $this->nextNumber($booking->sacrament, $year);

            $entry = RegisterEntry::create([
                'sacrament' => $booking->sacrament,
                'year' => $year,
                'sequence' => $sequence,
                'register_number' => $number,
                'verify_code' => $this->codeFor($booking, $fixedCode),
                'booking_id' => $booking->id,
                'source' => 'system',
                'subject_name' => mb_substr($snapshot['subjectName'], 0, 160),
                'ceremony_date' => $date,
                'snapshot' => $snapshot,
                'status' => 'valid',
                'entered_by' => $by?->id,
            ]);
            $this->audit->record($by, 'register.recorded', 'register_entry', $entry->id, [
                'registerNumber' => $number, 'bookingReference' => $booking->reference_number,
            ]);

            return $entry;
        });
    }

    /**
     * An entry copied from the paper book. Numbered in the ceremony's own year so it
     * never disturbs the current year's series. $data holds the validated request fields.
     */
    public function transcribe(array $data, User $by): RegisterEntry
    {
        return DB::transaction(function () use ($data, $by) {
            $this->assertPaperLineFree($data['sacrament'], $data['bookNo'] ?? null, $data['pageNo'] ?? null, $data['lineNo'] ?? null, null);

            $date = $data['ceremonyDate'];
            $year = (int) substr($date, 0, 4);
            ['sequence' => $sequence, 'number' => $number] = $this->nextNumber($data['sacrament'], $year);
            $snapshot = [
                'subjectName' => $data['subjectName'],
                'ceremonyDate' => $date,
                'minister' => $data['minister'],
                'parishName' => ParishSetting::parishName(),
                'parishAddress' => ParishSetting::parishAddress(),
                'title' => CertificateContent::titleFor($data['sacrament']),
                'statement' => CertificateContent::statementFor($data['sacrament']),
                'details' => self::cleanDetails($data['details'] ?? []),
            ];

            $entry = RegisterEntry::create([
                'sacrament' => $data['sacrament'],
                'year' => $year,
                'sequence' => $sequence,
                'register_number' => $number,
                'verify_code' => self::randomCode(),
                'booking_id' => null,
                'source' => 'transcribed',
                'subject_name' => mb_substr($data['subjectName'], 0, 160),
                'ceremony_date' => $date,
                'book_no' => self::blankToNull($data['bookNo'] ?? null),
                'page_no' => self::blankToNull($data['pageNo'] ?? null),
                'line_no' => self::blankToNull($data['lineNo'] ?? null),
                'snapshot' => $snapshot,
                'status' => 'valid',
                'entered_by' => $by->id,
            ]);
            $this->audit->record($by, 'register.transcribed', 'register_entry', $entry->id, ['registerNumber' => $number]);

            return $entry;
        });
    }

    /**
     * Fixes what the certificate says; the number, year and code never change.
     * A new ceremony date also rewrites the long-form date inside the statement and, unless
     * the detail rows are being replaced too, inside the existing rows.
     *
     * @param  array{subjectName?: string, ceremonyDate?: string, minister?: string, details?: array}  $changes
     */
    public function correct(RegisterEntry $e, array $changes, string $reason, User $by): RegisterEntry
    {
        return DB::transaction(function () use ($e, $changes, $reason, $by) {
            $e = RegisterEntry::findOrFail($e->id);
            if ($e->status === 'revoked') {
                throw new BookingRuleViolation('A revoked entry cannot be corrected. Reinstate it first.');
            }

            $snapshot = (array) $e->snapshot;
            $before = $after = [];
            foreach (['subjectName', 'ceremonyDate', 'minister'] as $key) {
                if (array_key_exists($key, $changes) && $changes[$key] !== ($snapshot[$key] ?? null)) {
                    $before[$key] = $snapshot[$key] ?? null;
                    $after[$key] = $changes[$key];
                }
            }
            if (array_key_exists('details', $changes)) {
                $details = self::cleanDetails($changes['details']);
                if ($details !== ($snapshot['details'] ?? [])) {
                    $before['details'] = $snapshot['details'] ?? [];
                    $after['details'] = $details;
                }
            }

            if ($after === []) {
                throw new BookingRuleViolation('Nothing was changed.');
            }

            $updated = $after + $snapshot;
            if (isset($after['ceremonyDate'])) {
                $old = Carbon::parse($before['ceremonyDate'])->format('F j, Y');
                $new = Carbon::parse($after['ceremonyDate'])->format('F j, Y');
                $updated['statement'] = str_replace($old, $new, (string) ($snapshot['statement'] ?? ''));
                if (! isset($after['details'])) {
                    $updated['details'] = array_map(fn (array $row) => ['label' => $row['label'], 'value' => str_replace($old, $new, $row['value'])], $snapshot['details'] ?? []);
                }
            }

            $e->update([
                'snapshot' => $updated,
                'subject_name' => mb_substr($updated['subjectName'], 0, 160),
                'ceremony_date' => $updated['ceremonyDate'],
                'corrected_at' => now(),
            ]);
            $this->audit->record($by, 'register.corrected', 'register_entry', $e->id, [
                'registerNumber' => $e->register_number, 'before' => $before, 'after' => $after, 'reason' => $reason,
            ]);

            return $e;
        });
    }

    public function setPaperReference(RegisterEntry $e, ?string $book, ?string $page, ?string $line, User $by): RegisterEntry
    {
        return DB::transaction(function () use ($e, $book, $page, $line, $by) {
            $e = RegisterEntry::findOrFail($e->id);
            [$book, $page, $line] = [self::blankToNull($book), self::blankToNull($page), self::blankToNull($line)];
            $this->assertPaperLineFree($e->sacrament, $book, $page, $line, $e->id);

            $before = ['bookNo' => $e->book_no, 'pageNo' => $e->page_no, 'lineNo' => $e->line_no];
            $e->update(['book_no' => $book, 'page_no' => $page, 'line_no' => $line]);
            $this->audit->record($by, 'register.paper_reference', 'register_entry', $e->id, [
                'registerNumber' => $e->register_number, 'before' => $before, 'after' => ['bookNo' => $book, 'pageNo' => $page, 'lineNo' => $line],
            ]);

            return $e;
        });
    }

    public function revoke(RegisterEntry $e, string $reason, User $by): RegisterEntry
    {
        return DB::transaction(function () use ($e, $reason, $by) {
            $e = RegisterEntry::findOrFail($e->id);
            if ($e->status === 'revoked') {
                throw new BookingRuleViolation('This entry is already revoked.');
            }
            $e->update(['status' => 'revoked', 'revoked_reason' => $reason, 'revoked_by' => $by->id, 'revoked_at' => now()]);
            $this->audit->record($by, 'register.revoked', 'register_entry', $e->id, ['registerNumber' => $e->register_number, 'reason' => $reason]);

            return $e;
        });
    }

    public function reinstate(RegisterEntry $e, string $reason, User $by): RegisterEntry
    {
        return DB::transaction(function () use ($e, $reason, $by) {
            $e = RegisterEntry::findOrFail($e->id);
            if ($e->status !== 'revoked') {
                throw new BookingRuleViolation('This entry is not revoked.');
            }
            $revokedReason = $e->revoked_reason;
            $e->update(['status' => 'valid', 'revoked_reason' => null, 'revoked_by' => null, 'revoked_at' => null]);
            $this->audit->record($by, 'register.reinstated', 'register_entry', $e->id, [
                'registerNumber' => $e->register_number, 'reason' => $reason, 'revokedReason' => $revokedReason,
            ]);

            return $e;
        });
    }

    /**
     * The DB index cannot catch a repeat when the line is NULL (NULLs are distinct), so the rule lives here:
     * the same book, page and line in the same register is the same paper entry, and a null line equals a null line.
     */
    private function assertPaperLineFree(string $sacrament, ?string $book, ?string $page, ?string $line, ?string $exceptId): void
    {
        $book = self::blankToNull($book);
        $page = self::blankToNull($page);
        $line = self::blankToNull($line);
        if ($book === null && $page === null && $line === null) {
            return;
        }

        $query = RegisterEntry::where('sacrament', $sacrament);
        foreach (['book_no' => $book, 'page_no' => $page, 'line_no' => $line] as $column => $value) {
            $value === null ? $query->whereNull($column) : $query->where($column, $value);
        }
        if ($exceptId !== null) {
            $query->where('id', '!=', $exceptId);
        }
        if ($clash = $query->first()) {
            throw new BookingRuleViolation("This book entry is already in the register as {$clash->register_number}.");
        }
    }

    /**
     * Detail rows the office typed: trimmed, and a row with no value is dropped.
     *
     * @return list<array{label: string, value: string}>
     */
    private static function cleanDetails(array $rows): array
    {
        $clean = [];
        foreach ($rows as $row) {
            $value = trim((string) ($row['value'] ?? ''));
            if ($value !== '') {
                $clean[] = ['label' => trim((string) ($row['label'] ?? '')), 'value' => $value];
            }
        }

        return $clean;
    }

    private static function blankToNull(?string $value): ?string
    {
        $value = $value === null ? null : trim($value);

        return $value === '' ? null : $value;
    }

    /** Anointing is private, so it is not verifiable. The demo seeder asks for a fixed code so a printed certificate survives a reset. */
    private function codeFor(Booking $booking, bool $fixedCode): ?string
    {
        if ($booking->sacrament === 'anointing') {
            return null;
        }
        $alphabet = self::CODE_ALPHABET;
        $code = '';
        if ($fixedCode) {
            foreach (str_split(substr(hash('sha256', $booking->reference_number, true), 0, 12)) as $byte) {
                $code .= $alphabet[ord($byte) % strlen($alphabet)];
            }

            return $code;
        }

        return self::randomCode();
    }

    private static function randomCode(): string
    {
        $alphabet = self::CODE_ALPHABET;
        $code = '';
        for ($i = 0; $i < 12; $i++) {
            $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }

        return $code;
    }

    /** What people type: spaces, dashes and lower case all resolve to the stored form. */
    public static function normaliseCode(string $input): string
    {
        return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $input));
    }

    public static function formatCode(?string $code): ?string
    {
        return $code === null ? null : implode('-', str_split($code, 4));
    }
}
