<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\CreateParishEventRequest;
use App\Http\Requests\UpdateParishEventRequest;
use App\Http\Resources\AdminParishEventResource;
use App\Models\AuditLog;
use App\Models\ParishEvent;
use App\Models\ParishSetting;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

/**
 * Item: staff/admin management of parish_events — previously the only way
 * data ever entered this table was ParishEventSeeder, hardcoding "next
 * Sunday" and one fixed baptism date. Scoped to 'role:staff,admin' (see
 * routes/api.php), same privilege level as Admin\BookingController — posting
 * a parish announcement isn't a security-sensitive action like user
 * management, which is admin-only for a documented reason.
 */
class ParishEventController extends Controller
{
    public function index(Request $request)
    {
        $when = $request->query('when');
        abort_unless($when === null || $when === '' || in_array($when, ['upcoming', 'past'], true), 422, 'The when filter must be upcoming or past.');

        // Upcoming: from now on, soonest first. Past: already happened, most recent first. No filter: newest date first.
        $query = ParishEvent::query();
        if ($when === 'upcoming') {
            $query->where('date', '>=', now())->orderBy('date');
        } elseif ($when === 'past') {
            $query->where('date', '<', now())->orderByDesc('date');
        } else {
            $query->orderByDesc('date');
        }
        $events = $query->paginate(10)->withQueryString();

        return AdminParishEventResource::collection($events);
    }

    /**
     * The time the office typed is parish time. A value with no offset ("2026-11-20T10:30") is read as Manila time, not
     * as UTC, which is what showed a 10:30 AM event as 6:30 PM. A value that carries an offset keeps it.
     */
    private function parishInstant(string $value): CarbonImmutable
    {
        // Stored in the app's own zone: Eloquent writes a date as the clock reads in the object's zone.
        return CarbonImmutable::parse($value, config('app.parish_timezone', 'Asia/Manila'))->setTimezone(config('app.timezone'));
    }

    public function store(CreateParishEventRequest $request)
    {
        $event = ParishEvent::create([
            'title' => $request->title,
            'date' => $this->parishInstant($request->date),
            // The form no longer asks where: an event is held at the parish unless an older client names a place.
            'location' => $request->location ?: ParishSetting::parishName(),
            'image_url' => $request->imageUrl,
            'category' => $request->category,
            'duration_minutes' => $request->integer('durationMinutes', 60),
            'blocks_bookings' => $request->boolean('blocksBookings', true),
            'created_by' => $request->user()->id,
        ]);

        $this->logAction($request, 'parish_event.created', $event, ['title' => $event->title]);

        return (new AdminParishEventResource($event->fresh()))->response()->setStatusCode(201);
    }

    public function update(UpdateParishEventRequest $request, string $id)
    {
        $event = ParishEvent::findOrFail($id);

        $event->update([
            'title' => $request->title,
            'date' => $this->parishInstant($request->date),
            'location' => $request->location ?: $event->location,
            'image_url' => $request->imageUrl,
            'category' => $request->category,
            // Left out of an older client's request: keep what the event already has.
            'duration_minutes' => $request->integer('durationMinutes', (int) $event->duration_minutes),
            'blocks_bookings' => $request->boolean('blocksBookings', (bool) $event->blocks_bookings),
        ]);

        $this->logAction($request, 'parish_event.updated', $event, ['title' => $event->title]);

        return new AdminParishEventResource($event->fresh());
    }

    public function destroy(Request $request, string $id)
    {
        $event = ParishEvent::findOrFail($id);

        $this->logAction($request, 'parish_event.deleted', $event, ['title' => $event->title]);

        $event->delete();

        return response()->json(null, 204);
    }

    private function logAction(Request $request, string $action, ParishEvent $event, array $metadata): void
    {
        $actor = $request->user();

        AuditLog::create([
            'actor_user_id' => $actor->id,
            'action' => $action,
            'subject_type' => 'parish_event',
            'subject_id' => $event->id,
            'metadata' => array_merge($metadata, [
                'actorName' => $actor->full_name,
                'actorEmail' => $actor->email,
            ]),
            'created_at' => now(),
        ]);
    }
}
