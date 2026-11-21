<?php

namespace App\Http\Resources;

use App\Models\RegisterEntry;
use App\Services\Register\CertificateRenderer;
use App\Services\Register\ParishRegister;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin RegisterEntry */
class RegisterEntryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'registerNumber' => $this->register_number,
            'sacrament' => $this->sacrament,
            'register' => ParishRegister::label($this->sacrament),
            'year' => $this->year,
            'sequence' => $this->sequence,
            'source' => $this->source,
            'status' => $this->status,
            'subjectName' => $this->subject_name,
            'ceremonyDate' => $this->ceremony_date->toDateString(),
            'bookNo' => $this->book_no,
            'pageNo' => $this->page_no,
            'lineNo' => $this->line_no,
            'verifiable' => $this->verify_code !== null,
            'verifyCode' => ParishRegister::formatCode($this->verify_code),
            'verifyUrl' => app(CertificateRenderer::class)->verifyUrl($this->resource),
            'snapshot' => $this->snapshot,
            'bookingId' => $this->booking_id,
            'bookingReference' => $this->booking?->reference_number,
            'revokedReason' => $this->revoked_reason,
            'revokedAt' => $this->revoked_at?->toISOString(),
            'correctedAt' => $this->corrected_at?->toISOString(),
            'enteredBy' => $this->enteredBy ? ['id' => $this->enteredBy->id, 'fullName' => $this->enteredBy->full_name] : null,
            'enteredAt' => $this->created_at->toISOString(),
        ];
    }
}
