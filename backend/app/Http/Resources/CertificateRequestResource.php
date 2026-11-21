<?php

namespace App\Http\Resources;

use App\Models\CertificateRequest;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * What the requester sees. It carries nothing from the register until staff issue the request,
 * and then only the entry's id and number.
 *
 * @mixin CertificateRequest
 */
class CertificateRequestResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $details = (array) $this->details;

        return [
            'id' => $this->id,
            'referenceNumber' => $this->reference_number,
            'sacrament' => $this->sacrament,
            'personName' => $this->person_name,
            'sacramentDateText' => $this->sacrament_date_text,
            'details' => [
                'fatherName' => $details['fatherName'] ?? null,
                'motherName' => $details['motherName'] ?? null,
                'spouseName' => $details['spouseName'] ?? null,
                'registerNumber' => $details['registerNumber'] ?? null,
            ],
            'relationship' => $this->relationship,
            'purpose' => $this->purpose,
            'status' => $this->status,
            'declineReason' => $this->decline_reason,
            'registerEntry' => $this->status === 'issued' && $this->registerEntry
                ? ['id' => $this->registerEntry->id, 'registerNumber' => $this->registerEntry->register_number]
                : null,
            'createdAt' => $this->created_at->toIso8601String(),
            'closedAt' => $this->closed_at?->toIso8601String(),
        ];
    }
}
