<?php

namespace App\Http\Resources;

use App\Enums\BookingStatus;
use App\Enums\PaymentStatus;
use App\Services\Booking\WeddingMilestones;
use App\Services\Register\CertificateRenderer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Arr;

class BookingResource extends JsonResource
{
    /** True for an item of a list response: the day pass is then left without its (costly) QR drawing. */
    public bool $inList = false;

    /** Items of a list never draw their QR code; only a single-booking response does. */
    protected static function newCollection($resource)
    {
        $collection = parent::newCollection($resource);
        $collection->collection->each(fn (self $item) => $item->inList = true);

        return $collection;
    }

    public function toArray(Request $request): array
    {
        $editable = in_array($this->status, [BookingStatus::Draft, BookingStatus::Returned], true);

        return [
            'id' => $this->id,
            'referenceNumber' => $this->reference_number,
            'userId' => $this->user_id,
            'sacrament' => $this->sacrament,
            'status' => $this->status->value,
            'statusLabel' => $this->status->label(),
            // Empty PHP arrays encode as [] — force {} so the client always gets an object.
            'formData' => empty($this->form_data) ? new \stdClass() : $this->form_data,
            'appointmentDate' => $this->appointmentDateString(),
            'appointmentStart' => $this->appointment_start,
            'appointmentEnd' => $this->appointment_end,
            'isEmergency' => (bool) $this->is_emergency,
            'paymentStatus' => $this->payment_status?->value,
            // Live quote while the parishioner can still change the answers; frozen snapshot after.
            'amountDueCentavos' => $this->displayAmountDueCentavos($editable),
            'paymentHoldExpiresAt' => $this->payment_hold_expires_at?->toISOString(),
            // Whether the owner can pay online right now (after approval, when approval-before-payment is on).
            'canPayNow' => $this->ownerCanPayNow(),
            // True when the office approves this booking BEFORE it is paid (a desk walk-in keeps pay-then-approve).
            'paymentAfterApproval' => (bool) config('paymongo.approval_before_payment') && $this->channel !== 'walk_in',
            'paidAt' => $this->paid_at?->toISOString(),
            'paymentReference' => $this->paymongo_payment_id,
            // 'gcash' | 'cash' | null (not chosen yet, or no fee).
            'paymentMethod' => $this->payment_method,
            'cashReceiptReference' => $this->cash_receipt_reference,
            'refundReference' => $this->refund_reference,
            'refundedAt' => $this->refunded_at?->toISOString(),
            'statusReason' => $this->status_reason,
            'returnNote' => $this->return_note,
            'channel' => $this->channel ?? 'online',
            'amountPaidCentavos' => $this->amount_paid_centavos,
            'amountRefundedCentavos' => (int) $this->amount_refunded_centavos,
            'overpaidCentavos' => $this->overpaidCentavos(),
            'documents' => array_map(function (array $doc) {
                if ($doc['review'] !== null) {
                    unset($doc['review']['reviewedBy']);
                }

                return $doc;
            }, $this->documentChecklist()),
            'registerEntry' => $this->registerEntry ? [
                'id' => $this->registerEntry->id,
                'registerNumber' => $this->registerEntry->register_number,
                'status' => $this->registerEntry->status,
                'enteredAt' => $this->registerEntry->created_at->toISOString(),
            ] : null,
            // A wedding's preparation checklist; [] for every other sacrament. Who ticked a step and the office's note on it
            // are for the office only; `data` (licence number, date, place, the Art. 34 flag) is the couple's own information.
            'milestones' => array_map(function (array $row) {
                $row = Arr::except($row, ['doneBy', 'note']);
                if (is_array($row['data'] ?? null)) {
                    $row['data'] = Arr::except($row['data'], 'note');
                }

                return $row;
            }, $this->milestoneRows()),
            'checkedInAt' => $this->checked_in_at?->toISOString(),
            'dayPass' => $this->dayPass(),
            'createdAt' => $this->created_at->toISOString(),
        ];
    }

    /** @var list<array>|null worked out once, though both resources read it */
    private ?array $milestoneRows = null;

    protected function milestoneRows(): array
    {
        return $this->milestoneRows ??= app(WeddingMilestones::class)->for($this->resource);
    }

    /** A paid (or fee-free) approved booking with an appointment shows a pass; its QR holds only the check-in address. */
    private function dayPass(): ?array
    {
        if ($this->status !== BookingStatus::Approved
            || $this->appointmentDateString() === null
            || ! in_array($this->payment_status, [PaymentStatus::Paid, PaymentStatus::NotRequired], true)) {
            return null;
        }

        $url = rtrim((string) config('app.admin_url'), '/').'/check-in/'.$this->reference_number;

        return $this->inList ? ['url' => $url] : ['url' => $url, 'qrSvg' => app(CertificateRenderer::class)->qrSvg($url, 220)];
    }
}
