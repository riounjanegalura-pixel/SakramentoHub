<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Booking;
use App\Models\BookingNote;
use Illuminate\Http\Request;

/** Staff-only, append-only notes. Deliberately no update or destroy. */
class BookingNoteController extends Controller
{
    public function index(string $id)
    {
        $booking = Booking::findOrFail($id);

        return response()->json($booking->notes()->with('author')->orderBy('created_at')->orderBy('id')->get()->map($this->shape(...))->values());
    }

    public function store(Request $request, string $id)
    {
        $request->validate(['body' => ['required', 'string', 'max:2000']]);
        $booking = Booking::findOrFail($id);

        $note = BookingNote::create([
            'booking_id' => $booking->id,
            'author_id' => $request->user()->id,
            'body' => trim($request->string('body')->toString()),
            'created_at' => now(),
        ]);

        return response()->json($this->shape($note->load('author')), 201);
    }

    private function shape(BookingNote $note): array
    {
        return [
            'id' => $note->id,
            'body' => $note->body,
            'author' => $note->author ? ['id' => $note->author->id, 'fullName' => $note->author->full_name] : null,
            'createdAt' => $note->created_at?->toISOString(),
        ];
    }
}
