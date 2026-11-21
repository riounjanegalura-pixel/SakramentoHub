<?php

namespace App\Http\Resources;

use App\Models\Booking;
use Illuminate\Http\Request;

class AdminBookingResource extends BookingResource
{
    public function toArray(Request $request): array
    {
        return array_merge(parent::toArray($request), [
            // ownerName()/ownerEmail() fall back to owner_snapshot after account deletion.
            'user' => [
                'fullName' => $this->ownerName(),
                'email' => $this->ownerEmail(),
                'phone' => $this->contactPhone(),
            ],
            // The desk edit screen reads the walk-in contact from here, not from `user` (which may be a linked account).
            'walkInContact' => $this->channel === 'walk_in' ? [
                'fullName' => data_get($this->owner_snapshot, 'fullName'),
                'phone' => data_get($this->owner_snapshot, 'phone'),
                'email' => data_get($this->owner_snapshot, 'email'),
                'relationship' => data_get($this->owner_snapshot, 'relationship'),
            ] : null,
            'subjectName' => $this->subjectName(),
            'createdBy' => $this->created_by ? ['id' => $this->created_by, 'fullName' => $this->creator?->full_name] : null,
            'isPriority' => $this->is_emergency || in_array($this->sacrament, Booking::PRIORITY_SACRAMENTS, true),
            'documents' => $this->documentChecklist(),
            'milestones' => $this->milestoneRows(),
            'checkoutSessionId' => $this->paymongo_checkout_session_id,
            'checkedInBy' => $this->checked_in_by ? ['id' => $this->checked_in_by, 'fullName' => $this->checkedInByUser?->full_name] : null,
        ]);
    }
}
