<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\BookingRuleViolation;
use App\Http\Controllers\Controller;
use App\Http\Resources\CertificateRequestResource;
use App\Models\CertificateRequest;
use App\Models\RegisterEntry;
use App\Models\User;
use App\Services\AuditTrail;
use App\Services\Booking\BookingNotifier;
use App\Services\Register\ParishRegister;
use App\Validation\OwnedDocument;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** A parishioner's requests for a copy of a past record (parishioner role only). */
class CertificateRequestController extends Controller
{
    public function index(Request $request)
    {
        return CertificateRequestResource::collection(
            CertificateRequest::with('registerEntry')->where('user_id', $request->user()->id)->orderByDesc('created_at')->orderByDesc('id')->get(),
        );
    }

    public function show(Request $request, string $id)
    {
        return new CertificateRequestResource($this->owned($request, $id));
    }

    public function store(Request $request, BookingNotifier $notifier, AuditTrail $audit)
    {
        $user = $request->user();
        if (! $user->hasVerifiedEmail()) {
            return response()->json([
                'message' => 'Please verify your email address before requesting a certificate. You can resend the verification email from the banner on your Home screen.',
            ], 403);
        }

        $data = $request->validate([
            'sacrament' => ['required', Rule::in(ParishRegister::CANONICAL)],
            // The register number printed on a certificate names the record on its own: with it, the name and date are not asked again.
            'registerNumber' => ['nullable', 'string', 'max:40'],
            'personName' => ['required_without:registerNumber', 'nullable', 'string', 'max:160'],
            'sacramentDateText' => ['required_without:registerNumber', 'nullable', 'string', 'max:60'],
            'details' => ['sometimes', 'nullable', 'array'],
            'details.fatherName' => ['nullable', 'string', 'max:160'],
            'details.motherName' => ['nullable', 'string', 'max:160'],
            'details.spouseName' => ['nullable', 'string', 'max:160'],
            'relationship' => ['required', Rule::in(CertificateRequest::RELATIONSHIPS)],
            'purpose' => ['required', 'string', 'max:200'],
            // The ID is always needed: staff compare it with the record before issuing.
            'idUrl' => ['required', 'string', new OwnedDocument([$user->id])],
            'letterUrl' => ['required_if:relationship,representative', 'nullable', 'string', new OwnedDocument([$user->id])],
        ]);

        $registerNumber = $this->clean($data['registerNumber'] ?? null);
        if ($registerNumber !== null) {
            $entry = RegisterEntry::where('register_number', strtoupper($registerNumber))->where('sacrament', $data['sacrament'])->where('status', 'valid')->first();
            if (! $entry) {
                throw ValidationException::withMessages([
                    'registerNumber' => 'We could not find that register number for this certificate. Check it, or leave it out and fill in the name and date.',
                ]);
            }
            $data['personName'] = $entry->subject_name;
            $data['sacramentDateText'] = $entry->ceremony_date->format('F j, Y');
        }

        $created = DB::transaction(function () use ($user, $data, $audit, $registerNumber) {
            // The account row serialises two requests made at once, so the limit cannot be passed by a race.
            User::whereKey($user->id)->lockForUpdate()->first();
            if (CertificateRequest::open()->where('user_id', $user->id)->count() >= CertificateRequest::OPEN_LIMIT) {
                throw new BookingRuleViolation('You already have '.CertificateRequest::OPEN_LIMIT.' open requests.');
            }

            $row = CertificateRequest::create([
                'user_id' => $user->id,
                'owner_snapshot' => ['fullName' => $user->full_name, 'email' => $user->email, 'phone' => $user->phone],
                'sacrament' => $data['sacrament'],
                'person_name' => trim($data['personName']),
                'sacrament_date_text' => trim($data['sacramentDateText']),
                'details' => [
                    'fatherName' => $this->clean($data['details']['fatherName'] ?? null),
                    'motherName' => $this->clean($data['details']['motherName'] ?? null),
                    'spouseName' => $this->clean($data['details']['spouseName'] ?? null),
                    'registerNumber' => $registerNumber === null ? null : strtoupper($registerNumber),
                ],
                'relationship' => $data['relationship'],
                'purpose' => trim($data['purpose']),
                'id_url' => $data['idUrl'],
                'letter_url' => $data['letterUrl'] ?? null,
                'status' => 'submitted',
            ]);
            $audit->record($user, 'certificate_request.requested', 'certificate_request', $row->id, [
                'reference' => $row->reference_number,
                'sacrament' => $row->sacrament,
                'personName' => $row->person_name,
            ]);

            return $row;
        });

        // The request is already saved; a failed alert must never turn it into an error for the parishioner.
        try {
            $notifier->staff(
                'New certificate request',
                "{$created->person_name} — requested by {$user->full_name}.",
                null,
                "/certificate-requests/{$created->id}",
            );
        } catch (\Throwable $e) {
            Log::error('Certificate request staff alert failed', ['id' => $created->id, 'error' => $e->getMessage()]);
        }

        return (new CertificateRequestResource($created))->response()->setStatusCode(201);
    }

    public function cancel(Request $request, string $id, AuditTrail $audit)
    {
        $user = $request->user();

        return DB::transaction(function () use ($user, $id, $audit) {
            $row = CertificateRequest::where('user_id', $user->id)->lockForUpdate()->findOrFail($id);
            if ($row->status !== 'submitted') {
                throw new BookingRuleViolation('Only a request that is still waiting can be cancelled.');
            }

            $row->update(['status' => 'cancelled', 'closed_at' => now()]);
            $audit->record($user, 'certificate_request.cancelled', 'certificate_request', $row->id, ['reference' => $row->reference_number]);

            return new CertificateRequestResource($row);
        });
    }

    private function owned(Request $request, string $id): CertificateRequest
    {
        return CertificateRequest::with('registerEntry')->where('user_id', $request->user()->id)->findOrFail($id);
    }

    private function clean(?string $value): ?string
    {
        $value = $value === null ? null : trim($value);

        return $value === '' ? null : $value;
    }
}
