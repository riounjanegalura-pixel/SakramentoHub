<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\AppNotificationResource;
use App\Http\Resources\NotificationPreferenceResource;
use App\Models\AppNotification;
use App\Models\NotificationPreference;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function getPreferences(Request $request)
    {
        $prefs = NotificationPreference::firstOrCreate(['user_id' => $request->user()->id]);

        // firstOrCreate() leaves DB-default column values (and the 201-triggering
        // wasRecentlyCreated flag) unreflected on a freshly-created instance; reload
        // it so a plain "get my preferences" always responds 200 with real values.
        return new NotificationPreferenceResource($prefs->fresh());
    }

    public function updatePreferences(Request $request)
    {
        $request->validate([
            'pushEnabled' => ['sometimes', 'boolean'],
            'bookingReminders' => ['sometimes', 'boolean'],
            'parishAnnouncements' => ['sometimes', 'boolean'],
        ]);

        $prefs = NotificationPreference::firstOrCreate(['user_id' => $request->user()->id]);

        $prefs->update(array_filter([
            'push_enabled' => $request->pushEnabled,
            'booking_reminders' => $request->bookingReminders,
            'parish_announcements' => $request->parishAnnouncements,
        ], fn ($v) => $v !== null));

        return new NotificationPreferenceResource($prefs->fresh());
    }

    public function index(Request $request)
    {
        $notifications = AppNotification::where('user_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->get();

        return AppNotificationResource::collection($notifications);
    }

    public function markAllRead(Request $request)
    {
        AppNotification::where('user_id', $request->user()->id)->update(['read' => true]);

        return response()->noContent();
    }

    public function markRead(Request $request, string $id)
    {
        $notification = AppNotification::where('user_id', $request->user()->id)->findOrFail($id);
        $notification->update(['read' => true]);

        return response()->noContent();
    }
}
