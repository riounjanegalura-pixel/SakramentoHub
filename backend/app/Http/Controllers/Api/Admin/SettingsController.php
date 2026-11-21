<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\AdminServiceResource;
use App\Models\ParishSetting;
use App\Models\Service;
use App\Services\AuditTrail;
use App\Services\Booking\BookingStateMachine;
use App\Services\Scheduling\LiturgicalCalendar;
use App\Support\ParishClock;
use App\Support\SignatureImage;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use InvalidArgumentException;

class SettingsController extends Controller
{
    /** API key => parish_settings key. */
    private const PARISH_KEYS = [
        'parishName' => 'parish_name', 'parishAddress' => 'parish_address', 'priestName' => 'priest_name', 'parishPhone' => 'parish_phone',
        'workingHoursStart' => 'working_hours_start', 'workingHoursEnd' => 'working_hours_end',
        'lunchStart' => 'lunch_start', 'lunchEnd' => 'lunch_end',
        'slotStepMinutes' => 'slot_step_minutes', 'travelBufferMinutes' => 'travel_buffer_minutes',
        'priestTitle' => 'priest_title', 'priestSignature' => 'priest_signature',
    ];

    /** API key => services column. */
    private const SERVICE_KEYS = [
        'name' => 'name', 'description' => 'description', 'feeRule' => 'fee_rule', 'priceCentavos' => 'price_centavos',
        'durationMinutes' => 'duration_minutes', 'allowedWeekdays' => 'allowed_weekdays', 'leadTimeDays' => 'lead_time_days',
        'dailyCapacity' => 'daily_capacity', 'sessionWeekdays' => 'session_weekdays', 'sessionTimes' => 'session_times',
        'sessionCapacity' => 'session_capacity', 'sessionDurationMinutes' => 'session_duration_minutes',
    ];

    /** The first session start that is before opening or ends after closing, or null when all fit. */
    private function sessionOutsideHours(Service $service, string $open, string $close): ?string
    {
        $minutes = fn (string $t) => (int) substr($t, 0, 2) * 60 + (int) substr($t, 3, 2);
        $length = (int) ($service->session_duration_minutes ?? $service->duration_minutes);
        $times = (array) $service->session_times;
        sort($times);
        foreach ($times as $time) {
            if ($minutes($time) < $minutes($open) || $minutes($time) + $length > $minutes($close)) {
                return $time;
            }
        }

        return null;
    }

    private function parish(): array
    {
        $out = [];
        foreach (self::PARISH_KEYS as $api => $key) {
            $out[$api] = ParishSetting::get($key);
        }
        $out['priestSignature'] = ParishSetting::priestSignature();

        return $out;
    }

    public function show(LiturgicalCalendar $calendar)
    {
        $year = ParishClock::today()->year;
        $triduum = [];
        foreach ([$year, $year + 1] as $y) {
            foreach ($calendar->triduum($y) as $date => $reason) {
                $triduum[] = compact('date', 'reason');
            }
        }

        return response()->json([
            'parish' => $this->parish(),
            'services' => AdminServiceResource::collection(Service::orderBy('id')->get())->resolve(),
            'policy' => [
                'paymentHoldHours' => BookingStateMachine::PAYMENT_HOLD_HOURS,
                'returnedHoldDays' => 7,
                'changeCutoffDays' => BookingStateMachine::CANCEL_APPROVED_MIN_DAYS,
            ],
            'triduum' => $triduum,
        ]);
    }

    public function updateParish(Request $request, AuditTrail $audit)
    {
        $data = $request->validate([
            'parishName' => ['sometimes', 'string', 'min:3', 'max:120'],
            'parishAddress' => ['sometimes', 'string', 'min:3', 'max:160'],
            'priestName' => ['sometimes', 'string', 'min:3', 'max:120'],
            'parishPhone' => ['sometimes', 'regex:/^(09\d{9}|\(0\d{2}\) ?\d{3,4}-?\d{4})$/'],
            'workingHoursStart' => ['sometimes', 'date_format:H:i'],
            'workingHoursEnd' => ['sometimes', 'date_format:H:i'],
            'lunchStart' => ['sometimes', 'date_format:H:i'],
            'lunchEnd' => ['sometimes', 'date_format:H:i'],
            'slotStepMinutes' => ['sometimes', 'integer', 'in:15,30,60'],
            'travelBufferMinutes' => ['sometimes', 'integer', 'min:0', 'max:120'],
            'priestTitle' => ['sometimes', 'string', 'min:3', 'max:80'],
            // A PNG or JPEG data URL, or null to remove it; the image itself is checked below by decoding it.
            'priestSignature' => ['sometimes', 'nullable', 'string', 'max:'.SignatureImage::MAX_DATA_URL_LENGTH],
        ], [
            'priestSignature.string' => SignatureImage::TYPE_MESSAGE,
            'priestSignature.max' => SignatureImage::SIZE_MESSAGE,
        ]);

        if (isset($data['priestSignature'])) {
            try {
                $data['priestSignature'] = SignatureImage::normalize($data['priestSignature']);
            } catch (InvalidArgumentException $e) {
                throw ValidationException::withMessages(['priestSignature' => $e->getMessage()]);
            }
        }

        foreach (['slotStepMinutes', 'travelBufferMinutes'] as $k) {
            if (array_key_exists($k, $data)) {
                $data[$k] = (int) $data[$k];
            }
        }
        $before = $this->parish();
        foreach (['slotStepMinutes', 'travelBufferMinutes'] as $k) {
            $before[$k] = $before[$k] === null ? null : (int) $before[$k];
        }
        $start = $data['workingHoursStart'] ?? $before['workingHoursStart'];
        $end = $data['workingHoursEnd'] ?? $before['workingHoursEnd'];
        if ($start >= $end) {
            // Blame the field the caller sent; when both were sent, the end.
            $field = array_key_exists('workingHoursEnd', $data) ? 'workingHoursEnd' : 'workingHoursStart';
            throw ValidationException::withMessages([$field => 'Working hours must end after they start.']);
        }

        // Changing the hours must not strand a session the parish already offers.
        foreach (Service::whereNotNull('session_times')->orderBy('id')->get() as $service) {
            if (($time = $this->sessionOutsideHours($service, $start, $end)) !== null) {
                $field = array_key_exists('workingHoursEnd', $data) ? 'workingHoursEnd' : 'workingHoursStart';
                throw ValidationException::withMessages([$field => "{$service->name}'s session at {$time} would fall outside the new working hours ({$start}–{$end})."]);
            }
        }

        $lunchStart = $data['lunchStart'] ?? $before['lunchStart'];
        $lunchEnd = $data['lunchEnd'] ?? $before['lunchEnd'];
        if ($lunchStart > $lunchEnd) {
            $field = array_key_exists('lunchEnd', $data) ? 'lunchEnd' : 'lunchStart';
            throw ValidationException::withMessages([$field => 'Lunch must end after it starts. Use the same time for both to have no lunch break.']);
        }
        $changedBefore = $changedAfter = [];
        foreach ($data as $api => $value) {
            if ($before[$api] !== $value) {
                ParishSetting::put(self::PARISH_KEYS[$api], $value);
                $changedBefore[$api] = $before[$api];
                $changedAfter[$api] = $value;
            }
        }
        if ($changedAfter !== []) {
            // The log keeps a short description of a signature image, never the image itself.
            $describe = fn (array $values) => array_key_exists('priestSignature', $values)
                ? array_replace($values, ['priestSignature' => SignatureImage::describe($values['priestSignature'])])
                : $values;
            [$changedBefore, $changedAfter] = [$describe($changedBefore), $describe($changedAfter)];
            $audit->record($request->user(), 'settings.parish_updated', 'parish_setting', 'parish', ['before' => $changedBefore, 'after' => $changedAfter]);
        }

        return response()->json($this->parish());
    }

    public function updateService(Request $request, string $id, AuditTrail $audit)
    {
        $service = Service::findOrFail($id);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'min:3', 'max:80'],
            'description' => ['sometimes', 'nullable', 'string', 'max:255'],
            'feeRule' => ['sometimes', 'in:none,flat,per_sponsor'],
            'priceCentavos' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:10000000'],
            'durationMinutes' => ['sometimes', 'integer', 'between:15,480'],
            'allowedWeekdays' => ['sometimes', 'array', 'min:1'],
            'allowedWeekdays.*' => ['integer', 'between:1,7', 'distinct'],
            'leadTimeDays' => ['sometimes', 'integer', 'between:0,365'],
            'dailyCapacity' => ['sometimes', 'nullable', 'integer', 'between:1,50'],
            'sessionWeekdays' => ['sometimes', 'array', 'min:1'],
            'sessionWeekdays.*' => ['integer', 'between:1,7', 'distinct'],
            'sessionTimes' => ['sometimes', 'array', 'min:1'],
            'sessionTimes.*' => ['date_format:H:i', 'distinct'],
            'sessionCapacity' => ['sometimes', 'integer', 'between:1,200'],
            'sessionDurationMinutes' => ['sometimes', 'integer', 'between:15,480'],
        ], [
            'sessionTimes.*.date_format' => 'Enter session times as HH:MM, for example 09:30.',
        ]);

        $sessionKeys = ['sessionWeekdays', 'sessionTimes', 'sessionCapacity', 'sessionDurationMinutes'];
        if (array_intersect($sessionKeys, array_keys($data)) !== [] && ! $service->hasSessions()) {
            throw ValidationException::withMessages(['sessionTimes' => 'This service has no fixed sessions.']);
        }

        // A session has to start and end inside working hours. Checked only when the sessions themselves change,
        // so an unrelated edit (a fee, a lead time) is never blocked by an older mismatch.
        if (array_intersect(['sessionTimes', 'sessionDurationMinutes'], array_keys($data)) !== []) {
            $candidate = $service->replicate()->fill(array_intersect_key(
                collect($data)->mapWithKeys(fn ($v, $k) => [self::SERVICE_KEYS[$k] => $v])->all(),
                array_flip(['session_times', 'session_duration_minutes']),
            ));
            [$open, $close] = ParishSetting::workingHours();
            if (($time = $this->sessionOutsideHours($candidate, $open, $close)) !== null) {
                throw ValidationException::withMessages(['sessionTimes' => "Session at {$time} falls outside working hours ({$open}–{$close})."]);
            }
        }

        $feeRule = $data['feeRule'] ?? $service->fee_rule;
        $price = array_key_exists('priceCentavos', $data) ? $data['priceCentavos'] : $service->price_centavos;
        if ($feeRule === 'per_sponsor' && ! in_array($service->id, ['baptism', 'confirmation', 'wedding'], true)) {
            throw ValidationException::withMessages(['feeRule' => 'This service has no sponsors to charge per sponsor.']);
        }
        if ($feeRule !== 'none' && ($price === null || $price < 1)) {
            throw ValidationException::withMessages(['priceCentavos' => 'Enter the fee amount.']);
        }
        if ($feeRule === 'none') {
            $data['priceCentavos'] = null;
        }

        $attributes = [];
        foreach ($data as $api => $value) {
            $attributes[self::SERVICE_KEYS[$api]] = $value;
        }
        $service->fill($attributes);

        $api = array_flip(self::SERVICE_KEYS);
        $before = $after = [];
        foreach ($service->getDirty() as $column => $value) {
            $before[$api[$column]] = $service->getOriginal($column);
            $after[$api[$column]] = $value;
        }
        $service->save();

        if ($after !== []) {
            $audit->record($request->user(), 'settings.service_updated', 'service', $service->id, ['before' => $before, 'after' => $after]);
        }

        return response()->json((new AdminServiceResource($service->fresh()))->resolve());
    }
}
