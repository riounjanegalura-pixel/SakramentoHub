<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ParishEventResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'date' => $this->date->toISOString(),
            'location' => $this->location,
            'imageUrl' => $this->image_url,
            'category' => $this->category,
        ];
    }
}
