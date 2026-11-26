<?php

namespace App\Services\Scheduling;

use App\Models\BlackoutDate;
use Carbon\CarbonImmutable;

class LiturgicalCalendar
{
    public function easterSunday(int $year): CarbonImmutable
    {
        $a = $year % 19;
        $b = intdiv($year, 100);
        $c = $year % 100;
        $d = intdiv($b, 4);
        $e = $b % 4;
        $f = intdiv($b + 8, 25);
        $g = intdiv($b - $f + 1, 3);
        $h = (19 * $a + $b - $d - $g + 15) % 30;
        $i = intdiv($c, 4);
        $k = $c % 4;
        $l = (32 + 2 * $e + 2 * $i - $h - $k) % 7;
        $m = intdiv($a + 11 * $h + 22 * $l, 451);
        $month = intdiv($h + $l - 7 * $m + 114, 31);
        $day = (($h + $l - 7 * $m + 114) % 31) + 1;

        return CarbonImmutable::create($year, $month, $day);
    }

    /** @return array<string, string> */
    public function triduum(int $year): array
    {
        $easter = $this->easterSunday($year);

        return [
            $easter->subDays(3)->toDateString() => 'Holy Thursday',
            $easter->subDays(2)->toDateString() => 'Good Friday',
            $easter->subDays(1)->toDateString() => 'Holy Saturday',
        ];
    }

    public function blackoutReason(string $date, string $sacrament): ?string
    {
        if ($sacrament !== 'anointing') {
            $triduum = $this->triduum((int) substr($date, 0, 4));
            if (isset($triduum[$date])) {
                return $triduum[$date];
            }
        }

        // Only a whole-day closure shuts the day; one with a time window just closes that window (see timedClosures).
        $row = BlackoutDate::whereDate('date', $date)->get()->first(fn (BlackoutDate $b) => ! $b->isTimed() && $b->appliesTo($sacrament));

        return $row?->reason;
    }

    /** The time windows closed on a date for one sacrament, as minutes from midnight. @return list<array{0:int,1:int}> */
    public function timedClosures(string $date, string $sacrament): array
    {
        return BlackoutDate::whereDate('date', $date)->get()
            ->filter(fn (BlackoutDate $b) => $b->isTimed() && $b->appliesTo($sacrament))
            ->map(fn (BlackoutDate $b) => $b->window())
            ->values()->all();
    }

    /** Every closure on a date, for display. start/end are "HH:MM" for a timed closure, null for the whole day. @return list<array{reason: string, appliesTo: string, start: ?string, end: ?string}> */
    public function notesFor(string $date, ?\Illuminate\Support\Collection $names = null, ?iterable $blackouts = null): array
    {
        $notes = [];
        $triduum = $this->triduum((int) substr($date, 0, 4));
        if (isset($triduum[$date])) {
            $notes[] = ['reason' => $triduum[$date], 'appliesTo' => 'All services except Anointing of the Sick', 'start' => null, 'end' => null];
        }

        $names ??= \App\Models\Service::pluck('name', 'id');
        foreach ($blackouts ?? BlackoutDate::whereDate('date', $date)->orderBy('id')->get() as $row) {
            $notes[] = [
                'reason' => $row->reason,
                'appliesTo' => $row->sacraments === null
                    ? 'All services'
                    : implode(', ', array_map(fn ($s) => $names[$s] ?? $s, $row->sacraments)),
                'start' => $row->isTimed() ? $row->start_time : null,
                'end' => $row->isTimed() ? $row->end_time : null,
            ];
        }

        return $notes;
    }
}
