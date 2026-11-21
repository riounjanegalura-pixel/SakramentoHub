<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class WalletDocumentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'personName' => $this->person_name,
            'fileUrl' => $this->file_url,
            'originalName' => $this->original_name,
            'mime' => $this->mime,
            'sizeBytes' => $this->size_bytes,
            'createdAt' => $this->created_at->toIso8601String(),
        ];
    }
}
