<?php
// backend/app/Services/Scheduling/AppointmentRequest.php

namespace App\Services\Scheduling;

use App\Models\Service;

final class AppointmentRequest
{
    public function __construct(
        public readonly string $sacrament,
        public readonly string $date,
        public readonly ?string $start,
        public readonly bool $session,
        public readonly bool $offsite,
    ) {}

    /** @param array<string, mixed> $context the booking's form data */
    public static function make(Service $service, string $date, ?string $start, array $context = []): self
    {
        $session = $service->hasSessions() && ($context['scheduleType'] ?? null) === 'regular';
        $offsite = $service->offsite || ($service->id === 'funeral' && ($context['massType'] ?? null) === 'house');

        return new self($service->id, $date, $start, $session, $offsite);
    }

    public function withStart(?string $start): self
    {
        return new self($this->sacrament, $this->date, $start, $this->session, $this->offsite);
    }
}
