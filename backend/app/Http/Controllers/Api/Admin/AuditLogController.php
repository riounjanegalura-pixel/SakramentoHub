<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\AuditLogResource;
use App\Models\AuditLog;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class AuditLogController extends Controller
{
    /**
     * Newest first. Optional filters: `area` (the part of the action code before the dot,
     * e.g. "booking"), `q` (action, actor name or email, or subject id), `from` / `to`
     * (parish-local dates, inclusive).
     */
    public function index(Request $request)
    {
        $data = $request->validate([
            'area' => ['nullable', 'string', 'max:64', 'regex:/^[a-z_]+$/'],
            'q' => ['nullable', 'string', 'max:100'],
            'from' => ['nullable', 'date_format:Y-m-d'],
            'to' => ['nullable', 'date_format:Y-m-d'],
        ]);

        $tz = config('app.parish_timezone', 'Asia/Manila');
        $query = AuditLog::with('actor')->orderByDesc('created_at');

        if (! empty($data['area'])) {
            $query->where('action', 'like', $data['area'].'.%');
        }
        if (! empty($data['q'])) {
            $term = '%'.addcslashes($data['q'], '%_\\').'%';
            $query->where(function ($q) use ($term) {
                $q->where('action', 'like', $term)
                    ->orWhere('subject_id', 'like', $term)
                    ->orWhereHas('actor', fn ($a) => $a->where('full_name', 'like', $term)->orWhere('email', 'like', $term));
            });
        }
        if (! empty($data['from'])) {
            $query->where('created_at', '>=', Carbon::parse($data['from'], $tz)->startOfDay()->utc());
        }
        if (! empty($data['to'])) {
            $query->where('created_at', '<=', Carbon::parse($data['to'], $tz)->endOfDay()->utc());
        }

        return AuditLogResource::collection($query->paginate(20)->withQueryString());
    }

    /**
     * The audit log's side panel: actions per parish day for the last 14 days (every day listed, zero included)
     * and who did the most in that time. A system action has no actor and is counted as "System".
     */
    public function summary(Request $request)
    {
        $days = 14;
        $tz = config('app.parish_timezone', 'Asia/Manila');
        $start = Carbon::now($tz)->startOfDay()->subDays($days - 1);

        $perDay = [];
        for ($i = 0; $i < $days; $i++) {
            $perDay[$start->copy()->addDays($i)->toDateString()] = 0;
        }
        $people = [];

        AuditLog::with('actor:id,full_name')
            ->where('created_at', '>=', $start->copy()->utc())
            ->get(['id', 'actor_user_id', 'created_at'])
            ->each(function (AuditLog $row) use (&$perDay, &$people, $tz) {
                $day = $row->created_at->copy()->setTimezone($tz)->toDateString();
                if (array_key_exists($day, $perDay)) {
                    $perDay[$day]++;
                }
                $name = $row->actor?->full_name ?? 'System';
                $people[$name] = ($people[$name] ?? 0) + 1;
            });

        arsort($people);

        return response()->json([
            'total' => array_sum($perDay),
            'days' => collect($perDay)->map(fn ($count, $date) => ['date' => $date, 'count' => $count])->values(),
            'people' => collect($people)->take(5)->map(fn ($count, $name) => ['name' => $name, 'count' => $count])->values(),
        ]);
    }
}
