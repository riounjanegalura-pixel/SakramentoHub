<?php

namespace App\Services\Scheduling;

use App\Models\ParishSetting;
use Carbon\CarbonImmutable;

/**
 * The parish's fixed weekly Masses (a setting, not typed in one by one). No sacrament is offered while a Mass is on, or
 * inside the buffer the office keeps before and after it. A row is either for certain weekdays or for the first Friday
 * of the month alone (the Holy Hour and its Mass).
 */
class MassSchedule
{
    /**
     * Minutes-from-midnight intervals [from, to) the Masses take on a date, already widened by the Mass buffer.
     *
     * @return list<array{0:int,1:int}>
     */
    public function intervalsFor(string $date): array
    {
        $day = CarbonImmutable::parse($date, config('app.parish_timezone'));
        $weekday = $day->dayOfWeekIso;
        $firstFriday = $weekday === 5 && $day->day <= 7;
        $buffer = ParishSetting::massBufferMinutes();

        $intervals = [];
        foreach (ParishSetting::massSchedule() as $row) {
            $applies = ($row['firstFriday'] ?? false)
                ? $firstFriday
                : in_array($weekday, array_map('intval', $row['weekdays'] ?? []), true);
            if (! $applies) {
                continue;
            }
            [$h, $m] = array_map('intval', explode(':', $row['time']));
            $start = $h * 60 + $m;
            $intervals[] = [max(0, $start - $buffer), $start + (int) $row['durationMinutes'] + $buffer];
        }

        return $intervals;
    }
}
