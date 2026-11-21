<?php

namespace Database\Seeders;

use App\Models\AuditLog;
use App\Models\Booking;
use App\Models\CertificateRequest;
use App\Models\Donation;
use App\Models\RegisterEntry;
use App\Models\Service;
use App\Models\User;
use App\Services\Register\ParishRegister;
use App\Support\ParishClock;
use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * DEMO ONLY. About six months of believable parish activity (bookings in every state, payments, refunds,
 * gifts, certificate requests and register entries) so the admin Reports screen has something to show.
 *
 * It is NOT called from DatabaseSeeder, and it refuses to run when APP_ENV=production. Run it by hand on a
 * local or throwaway database only:
 *
 *     php artisan db:seed --class=DemoDataSeeder
 *
 * See docs/DEMO_DATA.md. Safe to run twice: it stops if its demo parishioners already exist. Every
 * parishioner it makes has an email ending in @demo.sakramentohub.test, which is also how the data is found
 * again for clean-up. The numbers come from a fixed seed, so two runs on empty databases look the same.
 */
class DemoDataSeeder extends Seeder
{
    public const EMAIL_DOMAIN = 'demo.sakramentohub.test';

    private const GIVEN = [
        'Ramonito', 'Jovelyn', 'Nenita', 'Rodelio', 'Marites', 'Alnie', 'Rhea Mae', 'Arnulfo', 'Cresencia', 'Dionisio',
        'Leonora', 'Wilfredo', 'Ludivina', 'Reynante', 'Analyn', 'Glenda', 'Mylene', 'Eufemio', 'Bienvenido', 'Editha',
        'Marlon', 'Cherry Ann', 'Teodoro', 'Lorna', 'Efren', 'Dolores', 'Jun-jun', 'Fe', 'Armando', 'Teresita',
        'Rogelio', 'Imelda', 'Ernesto', 'Aileen', 'Placido', 'Gemma', 'Danilo', 'Josefina', 'Benigno', 'Maricel',
        'Nestor', 'Liezl', 'Cirilo', 'Evangeline', 'Randy', 'Ma. Luisa', 'Pio', 'Jenelyn', 'Hilario', 'Remedios',
    ];

    /** Ilocano, Bisaya, Kapampangan, Bicolano, Waray, Chavacano, Hiligaynon, Tagalog and Mindanao surnames. */
    private const SURNAME = [
        'Agbayani', 'Quitevis', 'Baniaga', 'Dumlao', 'Ragasa', 'Tabije', 'Balintec',
        'Pacaña', 'Tabada', 'Alcoseba', 'Cabahug', 'Gabutero', 'Sumaylo', 'Lumapas', 'Bacalso',
        'Manalastas', 'Layug', 'Sicat', 'Pamintuan', 'Lacsamana', 'Mangune',
        'Bobis', 'Nacion', 'Orbiso', 'Rebuena', 'Tuazon', 'Ollet',
        'Gabornes', 'Lagrimas', 'Abarquez', 'Cinco', 'Pelayo', 'Zacarias',
        'Climaco', 'Bayot', 'Elago', 'Jaldon', 'Pamaong',
        'Jalandoni', 'Sumagaysay', 'Locsin', 'Treñas', 'Gelacio',
        'Maglaya', 'Panganiban', 'Bagtas', 'Evangelista', 'Salonga', 'Tumulak', 'Balanay', 'Ocampo', 'Endaya', 'Yap',
        // Common in Bulacan and the nearby provinces, since this is a Balagtas parish.
        'Dela Cruz', 'Santos', 'Reyes', 'Bautista', 'Villanueva', 'Pascual', 'Mendoza', 'Manalo', 'Dizon', 'Tolentino',
        'Cabrera', 'Esguerra', 'Galang', 'Sta. Ana', 'Magat', 'Mercado', 'Aguilar', 'Salvador', 'Soriano', 'Pangilinan',
    ];

    private const PLACES = [
        'Laoag City, Ilocos Norte', 'Vigan City, Ilocos Sur', 'Candon City', 'San Fernando, Pampanga', 'Guagua, Pampanga',
        'Angeles City', 'Naga City, Camarines Sur', 'Legazpi City, Albay', 'Daraga, Albay', 'Tacloban City', 'Catbalogan, Samar',
        'Cebu City', 'Mandaue City', 'Talisay City, Cebu', 'Dumaguete City', 'Iloilo City', 'Roxas City, Capiz', 'Bacolod City',
        'Zamboanga City', 'Cagayan de Oro City', 'Davao City', 'Butuan City', 'Balagtas, Bulacan', 'Malolos City, Bulacan', 'Bocaue, Bulacan',
    ];

    private const CEMETERIES = ['Balagtas Public Cemetery', 'Holy Cross Memorial Park', 'Bocaue Catholic Cemetery', 'San Isidro Parish Cemetery', 'Libingan ng Bayan, Guiguinto'];

    private const PURPOSES = ['School requirement', 'Marriage requirements', 'Passport application', 'Employment abroad', 'Scholarship application', 'Personal copy'];

    private const DECLINE = [
        'The requested date conflicts with a parish activity.',
        'The documents did not match the details on the form.',
        'The seminar requirement has not been completed yet.',
    ];

    /** Spread of a typical month, per service: [id, bookings per month, allowed ISO weekdays, start times]. */
    private const MIX = [
        ['baptism', 15, [7, 7, 7, 6], ['10:00']],
        ['wedding', 4, [6, 6, 5, 4], ['09:00', '10:00', '14:00', '15:00']],
        ['confirmation', 4, [6, 6, 3], ['09:00', '14:00']],
        ['funeral', 6, [1, 2, 3, 4, 5, 6, 7], ['09:00', '10:00', '13:00', '14:00', '15:00']],
        ['anointing', 7, [1, 2, 3, 4, 5, 6, 7], ['08:00', '10:30', '13:30', '16:00', '18:30']],
        ['house-blessing', 5, [2, 3, 4, 5, 6], ['09:00', '10:00', '14:00', '15:00']],
    ];

    private const MONTHS_BACK = 6;

    /** @var list<User> */
    private array $owners = [];

    private ?User $admin = null;

    public function run(): void
    {
        if (app()->environment('production') && ! config('app.seed_demo_data')) {
            throw new \RuntimeException('DemoDataSeeder makes up parishioners and payments. Production runs it only when SEED_DEMO_DATA is on.');
        }
        if (Service::count() === 0) {
            throw new \RuntimeException('Run ServiceSeeder first (php artisan db:seed) so the six services exist.');
        }
        if (User::where('email', 'like', '%@'.self::EMAIL_DOMAIN)->exists()) {
            $this->command?->warn('Demo data is already here. Nothing was added.');

            return;
        }

        mt_srand(20261105);
        $this->admin = User::where('role', 'admin')->first();
        $this->makeOwners(42);

        $specs = $this->bookingSpecs();
        usort($specs, fn ($a, $b) => [$a['date'], $a['start']] <=> [$b['date'], $b['start']]); // the register is numbered in date order
        $register = app(ParishRegister::class);

        $made = 0;
        foreach ($specs as $spec) {
            $booking = $this->createBooking($spec);
            if ($booking->status->value === 'completed') {
                $register->record($booking, $this->admin);
            }
            $made++;
        }

        $this->transcribedEntries($register);
        $gifts = $this->donations();
        $certs = $this->certificateRequests();

        $this->command?->info("Demo data added: {$made} bookings, {$gifts} gifts, {$certs} certificate requests, ".RegisterEntry::count().' register entries.');
    }

    private function pick(array $list): mixed
    {
        return $list[mt_rand(0, count($list) - 1)];
    }

    private function chance(int $percent): bool
    {
        return mt_rand(1, 100) <= $percent;
    }

    private function makeOwners(int $count): void
    {
        $hash = bcrypt('password');
        $prefixes = ['0917', '0918', '0905', '0906', '0927', '0956', '0998', '0935', '0966', '0999'];
        $used = [];
        while (count($this->owners) < $count) {
            $given = $this->pick(self::GIVEN);
            $family = $this->pick(self::SURNAME);
            $key = "{$given} {$family}";
            if (isset($used[$key])) {
                continue;
            }
            $used[$key] = true;
            $slug = Str::slug(Str::ascii($given.'.'.$family), '.');
            $this->owners[] = User::create([
                'full_name' => $key,
                'email' => $slug.'@'.self::EMAIL_DOMAIN,
                'phone' => $this->pick($prefixes).str_pad((string) mt_rand(0, 9_999_999), 7, '0', STR_PAD_LEFT),
                'password' => $hash,
                'role' => 'parishioner',
                'is_active' => true,
                'email_verified_at' => now(),
                'privacy_consent_at' => now(),
            ]);
        }
    }

    /** @return list<array<string, mixed>> */
    private function bookingSpecs(): array
    {
        $today = ParishClock::today();
        $from = $today->subMonthsNoOverflow(self::MONTHS_BACK);
        $pastDays = (int) $from->diffInDays($today);
        $taken = [];
        $specs = [];

        foreach (self::MIX as [$id, $perMonth, $weekdays, $times]) {
            // The past six months, then a short run of upcoming requests that are still open.
            $plan = [[$perMonth * self::MONTHS_BACK, $from, $pastDays - 1], [(int) round($perMonth * 0.7), $today->addDays(2), 30]];
            foreach ($plan as [$n, $start, $span]) {
                for ($i = 0; $i < $n; $i++) {
                    $day = $start->addDays(mt_rand(0, $span));
                    for ($guard = 0; $guard < 7 && ! in_array($day->dayOfWeekIso, $weekdays, true); $guard++) {
                        $day = $day->addDay();
                    }
                    $time = $this->pick($times);
                    $slot = "{$id}|{$day->toDateString()}|{$time}";
                    if (isset($taken[$slot]) || ($id === 'wedding' && $this->weddingsOn($taken, $day) >= 2)) {
                        continue;
                    }
                    $taken[$slot] = true;
                    $specs[] = ['sacrament' => $id, 'date' => $day->toDateString(), 'start' => $time, 'future' => $day->gte($today)];
                }
            }
        }

        return $specs;
    }

    private function weddingsOn(array $taken, CarbonImmutable $day): int
    {
        return count(array_filter(array_keys($taken), fn ($k) => str_starts_with($k, 'wedding|'.$day->toDateString())));
    }

    private function createBooking(array $spec): Booking
    {
        $id = $spec['sacrament'];
        $service = Service::find($id);
        $walkIn = $this->chance(18);
        $owner = $this->pick($this->owners);
        $form = $this->formData($id, $owner, $spec['date']);
        $due = $this->amountDue($id, $form);

        $end = CarbonImmutable::parse($spec['date'].' '.$spec['start'])->addMinutes((int) ($service->duration_minutes ?? 45))->format('H:i');
        $lead = match ($id) {
            'baptism' => mt_rand(9, 45), 'wedding' => mt_rand(30, 120), 'confirmation' => mt_rand(16, 60),
            'house-blessing' => mt_rand(4, 20), default => mt_rand(0, 2),
        };
        $appointment = CarbonImmutable::parse($spec['date'], 'Asia/Manila');
        $created = $appointment->subDays($lead)->setTime(mt_rand(8, 17), mt_rand(0, 59));
        if ($created->isFuture()) {
            $created = ParishClock::now()->subHours(mt_rand(2, 70));
        }

        [$status, $payment, $extra] = $this->outcome($spec['future'], $due, $walkIn, $created);

        $attrs = [
            'reference_number' => Booking::generateReferenceNumber($id, $created),
            'user_id' => $walkIn ? null : $owner->id,
            'sacrament' => $id,
            'status' => $status,
            'form_data' => $form,
            'payment_status' => $payment,
            'amount_due_centavos' => $due,
            'appointment_date' => $spec['date'],
            'appointment_start' => $spec['start'],
            'appointment_end' => $end,
            'is_offsite' => (bool) $service->offsite || ($id === 'wedding' && ($form['venueType'] ?? 'parish') === 'other'),
            'is_emergency' => $id === 'anointing' && $this->chance(25),
            'channel' => $walkIn ? 'walk_in' : 'online',
        ] + $extra;

        if ($walkIn) {
            $attrs['created_by'] = $this->admin?->id;
            $attrs['owner_snapshot'] = ['fullName' => $owner->full_name, 'phone' => $owner->phone, 'email' => null];
        }
        if ($status === 'completed') {
            $attrs['checked_in_at'] = $appointment->setTimeFromTimeString($spec['start'])->subMinutes(mt_rand(5, 25))->utc();
            $attrs['checked_in_by'] = $this->admin?->id;
        }

        $booking = new Booking($attrs);
        $booking->forceFill(['created_at' => $created->utc(), 'updated_at' => $created->utc()]);
        $booking->save();

        if (in_array($payment, ['refunded', 'refund_due'], true) && ($extra['amount_refunded_centavos'] ?? 0) > 0) {
            AuditLog::create([
                'actor_user_id' => $this->admin?->id, 'action' => 'booking.refunded', 'subject_type' => 'booking', 'subject_id' => $booking->id,
                'metadata' => ['amountCentavos' => $extra['amount_refunded_centavos'], 'reference' => $booking->reference_number],
                'created_at' => $extra['refunded_at'] ?? $created->addDays(2)->utc(),
            ]);
        }

        return $booking;
    }

    /** @return array{0: string, 1: string, 2: array<string, mixed>} status, payment status, extra columns */
    private function outcome(bool $future, int $due, bool $walkIn, CarbonImmutable $created): array
    {
        $paidAt = $created->addHours(mt_rand(1, 30))->utc();
        $paid = fn () => $walkIn
            ? ['amount_paid_centavos' => $due, 'paid_at' => $paidAt, 'payment_method' => 'cash', 'cash_receipt_reference' => 'OR-'.mt_rand(10_000, 99_999)]
            : ['amount_paid_centavos' => $due, 'paid_at' => $paidAt, 'payment_method' => 'gcash'];

        if ($future) {
            $roll = mt_rand(1, 100);
            if ($roll <= 45) {
                return ['submitted', $due > 0 ? 'unpaid' : 'not_required', $due > 0 ? ['payment_hold_expires_at' => now()->addHours(mt_rand(6, 46))] : []];
            }
            if ($roll <= 90) {
                return ['approved', $due > 0 ? 'paid' : 'not_required', $due > 0 ? $paid() : []];
            }

            return ['returned', $due > 0 ? 'paid' : 'not_required', ($due > 0 ? $paid() : []) + [
                'returned_at' => now()->subDays(mt_rand(1, 3)), 'return_note' => 'Please upload a clearer copy of the baptismal certificate.',
            ]];
        }

        $roll = mt_rand(1, 100);
        if ($roll <= 85) {
            return ['completed', $due > 0 ? 'paid' : 'not_required', $due > 0 ? $paid() : []];
        }
        if ($roll <= 93) {
            return ['declined', $due > 0 ? 'void' : 'not_required', ['status_reason' => $this->pick(self::DECLINE)]];
        }
        if ($due === 0) {
            return ['cancelled', 'not_required', ['status_reason' => 'Cancelled by the family.']];
        }
        // A paid booking that was cancelled: mostly refunded already, now and then still owed.
        $refunded = $this->chance(75);

        return ['cancelled', $refunded ? 'refunded' : 'refund_due', $paid() + [
            'status_reason' => 'Cancelled by the family.',
            'amount_refunded_centavos' => $refunded ? $due : 0,
            'refunded_at' => $refunded ? $created->addDays(mt_rand(3, 9))->utc() : null,
        ]];
    }

    private function amountDue(string $id, array $form): int
    {
        return match ($id) {
            'baptism' => 5000 * count($form['sponsors'] ?? []),
            'wedding' => 500000,
            default => 0,
        };
    }

    private function person(?string $surname = null): array
    {
        return [$this->pick(self::GIVEN), $surname ?? $this->pick(self::SURNAME)];
    }

    private function birth(int $minYears, int $maxYears, string $relativeTo): string
    {
        return CarbonImmutable::parse($relativeTo)->subDays(mt_rand($minYears * 365, $maxYears * 365))->toDateString();
    }

    /** Just enough of each form for the register and certificate to read properly. */
    private function formData(string $id, User $owner, string $date): array
    {
        $family = $this->pick(self::SURNAME);
        [$givenA, $familyA] = $this->person($family);
        $sponsors = fn (string $a, string $b, int $n = 2) => array_slice([
            ['role' => $a, 'firstName' => $this->pick(self::GIVEN), 'lastName' => $this->pick(self::SURNAME), 'age' => mt_rand(24, 58), 'religion' => 'Roman Catholic', 'residence' => $this->pick(self::PLACES)],
            ['role' => $b, 'firstName' => $this->pick(self::GIVEN), 'lastName' => $this->pick(self::SURNAME), 'age' => mt_rand(24, 58), 'religion' => 'Roman Catholic', 'residence' => $this->pick(self::PLACES)],
        ], 0, $n);
        $parents = [
            'fatherFirstName' => $this->pick(self::GIVEN), 'fatherLastName' => $family,
            'motherFirstName' => $this->pick(self::GIVEN), 'motherLastName' => $this->pick(self::SURNAME),
        ];
        $contact = ['contactName' => $owner->full_name, 'contactPhone' => $owner->phone];

        return match ($id) {
            'baptism' => $contact + $parents + [
                'bookingFor' => 'other', 'relationship' => 'child', 'scheduleType' => 'regular',
                'childFirstName' => $givenA, 'childLastName' => $family, 'childSex' => $this->pick(['male', 'female']),
                'childDateOfBirth' => $this->birth(0, 1, $date), 'childPlaceOfBirth' => $this->pick(self::PLACES),
                'fatherOmitted' => false, 'sponsors' => $sponsors('ninong', 'ninang'),
            ],
            'confirmation' => $contact + $parents + [
                'confirmandFirstName' => $givenA, 'confirmandLastName' => $family,
                'confirmandDateOfBirth' => $this->birth(12, 17, $date), 'confirmandPlaceOfBirth' => $this->pick(self::PLACES),
                'sponsors' => $sponsors('sponsor', 'sponsor', 1),
            ],
            'wedding' => $contact + [
                'groomFirstName' => $this->pick(self::GIVEN), 'groomLastName' => $this->pick(self::SURNAME),
                'brideFirstName' => $this->pick(self::GIVEN), 'brideLastName' => $this->pick(self::SURNAME),
                'venueType' => $this->chance(85) ? 'parish' : 'other', 'venueName' => 'Garden venue, Bulacan',
                'sponsors' => $sponsors('ninong', 'ninang'),
            ],
            'funeral' => $contact + [
                'deceasedFirstName' => $givenA, 'deceasedLastName' => $family,
                'deceasedDateOfDeath' => CarbonImmutable::parse($date)->subDays(mt_rand(1, 4))->toDateString(),
                'massType' => $this->pick(['church', 'church', 'house']), 'burialCemetery' => $this->pick(self::CEMETERIES),
            ],
            'anointing' => $contact + [
                'patientFirstName' => $givenA, 'patientLastName' => $family,
                'locationType' => $this->pick(['home', 'hospital']), 'hospitalName' => 'District Hospital', 'hospitalRoom' => 'Ward '.mt_rand(1, 6),
                'patientAddress' => $this->pick(self::PLACES),
            ],
            default => $contact + [
                'propertyOwner' => "{$givenA} {$family}", 'propertyType' => $this->pick(['house', 'house', 'business', 'vehicle']),
                'propertyAddress' => 'Purok '.mt_rand(1, 7).', '.$this->pick(self::PLACES),
            ],
        };
    }

    /** Older entries copied from the paper book, so the register is not only six months deep. */
    private function transcribedEntries(ParishRegister $register): void
    {
        if ($this->admin === null) {
            return;
        }
        $kinds = ['baptism' => 'Baptism', 'confirmation' => 'Confirmation', 'wedding' => 'Marriage'];
        for ($i = 0; $i < 24; $i++) {
            $sacrament = $this->pick(array_keys($kinds));
            [$given, $family] = $this->person();
            $subject = $sacrament === 'wedding' ? "{$given} {$family} & {$this->pick(self::GIVEN)} {$this->pick(self::SURNAME)}" : "{$given} {$family}";
            $register->transcribe([
                'sacrament' => $sacrament,
                'subjectName' => $subject,
                'ceremonyDate' => CarbonImmutable::create(mt_rand(2008, 2024), mt_rand(1, 12), mt_rand(1, 28))->toDateString(),
                'minister' => $this->pick(['Rev. Fr. Anselmo Dizon', 'Rev. Fr. Teofilo Marasigan', 'Rev. Fr. Bernardo Calub']),
                'bookNo' => (string) mt_rand(3, 14), 'pageNo' => (string) (10 + $i), 'lineNo' => (string) mt_rand(1, 12),
                'details' => [],
            ], $this->admin);
        }
    }

    private function donations(): int
    {
        $count = 0;
        $from = ParishClock::today()->subMonthsNoOverflow(self::MONTHS_BACK);
        $days = (int) $from->diffInDays(ParishClock::today());
        foreach (range(1, mt_rand(55, 75)) as $ignored) {
            $paidAt = $from->addDays(mt_rand(0, $days - 1))->setTime(mt_rand(6, 21), mt_rand(0, 59));
            $gift = new Donation([
                'user_id' => $this->pick($this->owners)->id,
                'amount_centavos' => $this->pick([5000, 10000, 10000, 20000, 20000, 50000, 100000, 250000]),
                'status' => 'paid',
                'paid_at' => $paidAt->utc(),
            ]);
            $gift->forceFill(['created_at' => $paidAt->subMinutes(3)->utc(), 'updated_at' => $paidAt->utc()])->save();
            $count++;
        }

        return $count;
    }

    private function certificateRequests(): int
    {
        $entries = RegisterEntry::whereIn('sacrament', ['baptism', 'confirmation', 'wedding'])->get();
        if ($entries->isEmpty()) {
            return 0;
        }
        $count = 0;
        $from = ParishClock::today()->subMonthsNoOverflow(self::MONTHS_BACK);
        $days = (int) $from->diffInDays(ParishClock::today());

        foreach (range(1, mt_rand(36, 48)) as $ignored) {
            $entry = $entries->random();
            $requester = $this->pick($this->owners);
            $closed = $from->addDays(mt_rand(1, $days - 1))->setTime(mt_rand(8, 16), mt_rand(0, 59));
            $roll = mt_rand(1, 100);
            $status = $roll <= 82 ? 'issued' : ($roll <= 92 ? 'declined' : 'submitted');
            $request = new CertificateRequest([
                'reference_number' => 'CERT-'.$closed->format('Ymd').'-'.strtoupper(Str::random(4)),
                'user_id' => $requester->id,
                'sacrament' => $entry->sacrament,
                'person_name' => $entry->subject_name,
                'sacrament_date_text' => $entry->ceremony_date->format('F j, Y'),
                'relationship' => $this->pick(['self', 'self', 'parent', 'child', 'spouse', 'sibling']),
                'purpose' => $this->pick(self::PURPOSES),
                'status' => $status,
                'decline_reason' => $status === 'declined' ? 'We could not find a matching record. Please bring a copy of the original.' : null,
                'register_entry_id' => $status === 'issued' ? $entry->id : null,
                'handled_by' => $status === 'submitted' ? null : $this->admin?->id,
                'closed_at' => $status === 'submitted' ? null : $closed->utc(),
            ]);
            $request->forceFill(['created_at' => $closed->subDays(mt_rand(1, 3))->utc(), 'updated_at' => $closed->utc()])->save();
            $count++;
        }

        return $count;
    }
}
