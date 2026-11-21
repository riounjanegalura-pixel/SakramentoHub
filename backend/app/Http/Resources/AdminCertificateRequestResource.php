<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;

class AdminCertificateRequestResource extends CertificateRequestResource
{
    public function toArray(Request $request): array
    {
        return array_merge(parent::toArray($request), [
            // Fall back to the snapshot once the account is deleted.
            'requester' => [
                'fullName' => $this->requesterName(),
                'email' => $this->requesterEmail(),
                'phone' => $this->requesterPhone(),
            ],
            'idUrl' => $this->id_url,
            'letterUrl' => $this->letter_url,
            'filesRemovedAt' => $this->files_removed_at?->toIso8601String(),
            'handledBy' => $this->handler ? ['id' => $this->handler->id, 'fullName' => $this->handler->full_name] : null,
        ]);
    }
}
