<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ParishEventResource;
use App\Models\ParishEvent;

class ParishEventController extends Controller
{
    public function upcoming()
    {
        $events = ParishEvent::where('date', '>=', now()->subDay())
            ->orderBy('date')
            ->get();

        return ParishEventResource::collection($events);
    }
}
