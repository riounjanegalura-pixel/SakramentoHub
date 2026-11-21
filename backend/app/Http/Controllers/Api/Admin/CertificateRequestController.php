<?php

namespace App\Http\Controllers\Api\Admin;

use App\Exceptions\BookingRuleViolation;
use App\Http\Controllers\Controller;
use App\Http\Resources\AdminCertificateRequestResource;
use App\Models\CertificateRequest;
use App\Models\RegisterEntry;
use App\Services\AuditTrail;
use App\Services\Booking\BookingNotifier;
use App\Services\Register\ParishRegister;
use App\Support\TextSearch;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** The office's side of certificate copy requests: find the record, issue it or decline. */
class CertificateRequestController extends Controller
{
    public function __construct(private AuditTrail $audit, private BookingNotifier $notify) {}

    public function index(Request $request)
    {
        $request->validate([
            'status' => ['sometimes', Rule::in(CertificateRequest::STATUSES)],
            'search' => ['sometimes', 'string', 'max:255'],
            'perPage' => ['sometimes', 'integer', 'between:1,100'],
        ]);

        $query = CertificateRequest::with('user', 'handler', 'registerEntry');
        if ($request->filled('status')) {
            $query->where('status', $request->string('status')->toString());
        }
        if ($request->filled('search')) {
            // TextSearch: case-insensitive on SQLite and MySQL alike, including Ñ and accented capitals.
            $term = trim($request->string('search')->toString());
            $query->where(function ($q) use ($term) {
                TextSearch::orContains($q, 'reference_number', $term);
                TextSearch::orContains($q, 'person_name', $term);
                $q->orWhereHas('user', fn ($u) => $u->where(fn ($n) => TextSearch::orContains($n, 'full_name', $term)));
                TextSearch::orContains($q, "JSON_EXTRACT(owner_snapshot, '$.fullName')", $term);
            });
        }

        // Open requests first and oldest first (the one waiting longest is on top); closed ones after, newest first.
        return AdminCertificateRequestResource::collection(
            $query->orderByRaw("CASE WHEN status = 'submitted' THEN 0 ELSE 1 END")
                ->orderByRaw("CASE WHEN status = 'submitted' THEN created_at END ASC")
                ->orderByDesc('created_at')->orderBy('id')
                ->paginate($request->integer('perPage', 15))->withQueryString(),
        );
    }

    public function show(string $id)
    {
        return new AdminCertificateRequestResource(CertificateRequest::with('user', 'handler', 'registerEntry')->findOrFail($id));
    }

    public function issue(Request $request, string $id)
    {
        $data = $request->validate(['registerEntryId' => ['required', 'string', 'exists:register_entries,id']]);

        return DB::transaction(function () use ($request, $id, $data) {
            $row = $this->lockedOpen($id);
            $entry = RegisterEntry::findOrFail($data['registerEntryId']);
            if ($entry->status === 'revoked') {
                throw new BookingRuleViolation('That entry is revoked.');
            }
            if ($entry->sacrament !== $row->sacrament) {
                throw new BookingRuleViolation('That entry is in the '.ParishRegister::label($entry->sacrament).' register.');
            }

            $row->update(['status' => 'issued', 'register_entry_id' => $entry->id, 'handled_by' => $request->user()->id, 'closed_at' => now()]);
            $this->audit->record($request->user(), 'certificate_request.issued', 'certificate_request', $row->id, [
                'reference' => $row->reference_number, 'registerEntryId' => $entry->id, 'registerNumber' => $entry->register_number,
            ]);
            if ($row->user !== null) {
                $this->notify->user($row->user, 'Certificate ready', "Your copy of the {$entry->register_number} certificate is ready. Open it under My certificates.", mail: true, actionUrl: $this->notify->walletUrl(), actionLabel: 'Open your wallet', subject: "Certificate ready ({$row->reference_number})");
            }

            return $this->respond($row);
        });
    }

    public function decline(Request $request, string $id)
    {
        $reason = $request->validate(['reason' => ['required', 'string', 'max:500']])['reason'];

        return DB::transaction(function () use ($request, $id, $reason) {
            $row = $this->lockedOpen($id);

            $row->update(['status' => 'declined', 'decline_reason' => $reason, 'handled_by' => $request->user()->id, 'closed_at' => now()]);
            $this->audit->record($request->user(), 'certificate_request.declined', 'certificate_request', $row->id, [
                'reference' => $row->reference_number, 'reason' => $reason,
            ]);
            if ($row->user !== null) {
                $this->notify->user($row->user, 'Certificate request declined', "Your request {$row->reference_number} was declined: {$reason}", mail: true, actionUrl: $this->notify->walletUrl(), actionLabel: 'Open your wallet', subject: "Certificate request declined ({$row->reference_number})");
            }

            return $this->respond($row);
        });
    }

    /** The row, re-read under a lock, and only while it is still waiting. */
    private function lockedOpen(string $id): CertificateRequest
    {
        $row = CertificateRequest::lockForUpdate()->findOrFail($id);
        if ($row->status !== 'submitted') {
            throw new BookingRuleViolation('Only a request that is still waiting can be issued or declined.');
        }

        return $row;
    }

    private function respond(CertificateRequest $row): AdminCertificateRequestResource
    {
        return new AdminCertificateRequestResource($row->load('user', 'handler', 'registerEntry'));
    }
}
