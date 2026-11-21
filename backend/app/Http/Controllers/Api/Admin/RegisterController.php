<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Http\Resources\AuditLogResource;
use App\Http\Resources\RegisterEntryResource;
use App\Models\AuditLog;
use App\Models\RegisterEntry;
use App\Services\Register\CertificateRenderer;
use App\Services\Register\ParishRegister;
use App\Support\ParishClock;
use App\Support\TextSearch;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class RegisterController extends Controller
{
    public function __construct(private ParishRegister $register) {}

    public function index(Request $request)
    {
        $request->validate([
            'sacrament' => ['sometimes', Rule::in(array_keys(ParishRegister::PREFIXES))],
            'year' => ['sometimes', 'integer', 'between:1500,2200'],
            'status' => ['sometimes', 'in:valid,revoked'],
            'source' => ['sometimes', 'in:system,transcribed'],
            'search' => ['sometimes', 'string', 'max:255'],
            'perPage' => ['sometimes', 'integer', 'between:1,100'],
        ]);

        $query = RegisterEntry::with('enteredBy', 'booking:id,reference_number');
        foreach (['sacrament', 'status', 'source'] as $column) {
            if ($request->filled($column)) {
                $query->where($column, $request->string($column)->toString());
            }
        }
        if ($request->filled('year')) {
            $query->where('year', $request->integer('year'));
        }
        if ($request->filled('search')) {
            // TextSearch: case-insensitive on SQLite and MySQL alike, including Ñ and accented capitals.
            $term = trim($request->string('search')->toString());
            $query->where(function ($q) use ($term) {
                TextSearch::orContains($q, 'subject_name', $term);
                TextSearch::orContains($q, 'register_number', $term);
            });
        }

        return RegisterEntryResource::collection(
            $query->orderByDesc('created_at')->orderByDesc('id')->paginate($request->integer('perPage', 15))->withQueryString(),
        );
    }

    public function show(string $id)
    {
        $entry = RegisterEntry::with('enteredBy', 'booking:id,reference_number')->findOrFail($id);

        return response()->json((new RegisterEntryResource($entry))->resolve() + ['history' => $this->history($entry)]);
    }

    public function certificate(string $id, CertificateRenderer $certificates)
    {
        return response($certificates->html(RegisterEntry::findOrFail($id)), 200, ['Content-Type' => 'text/html', 'Cache-Control' => 'no-store']);
    }

    /** A typed year such as 0026 is a slip; nothing in a parish register is older than the 1500s. */
    private const YEAR_MESSAGE = ['ceremonyDate.after_or_equal' => 'Check the year of the ceremony date.'];

    /**
     * The next book and page numbers, counted on from the highest one in the register (00010, 00011...), so the
     * office does not have to count by hand. Numbers typed from an old paper book that are not plain digits are ignored.
     */
    public function nextNumbers()
    {
        $next = fn (string $column) => str_pad((string) (RegisterEntry::query()->pluck($column)
            ->filter(fn ($v) => $v !== null && ctype_digit((string) $v))->map(fn ($v) => (int) $v)->max() + 1), 5, '0', STR_PAD_LEFT);

        return response()->json(['bookNo' => $next('book_no'), 'pageNo' => $next('page_no')]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'sacrament' => ['required', Rule::in(ParishRegister::CANONICAL)],
            'ceremonyDate' => ['required', 'date_format:Y-m-d', 'after_or_equal:1500-01-01', 'before_or_equal:'.ParishClock::todayString()],
            'subjectName' => ['required', 'string', 'max:160'],
            'minister' => ['required', 'string', 'max:120'],
            'details' => ['sometimes', 'array', 'max:12'],
            'details.*.label' => ['required', 'string', 'max:60'],
            'details.*.value' => ['nullable', 'string', 'max:200'],
            'bookNo' => ['required', 'string', 'max:20'],
            'pageNo' => ['required', 'string', 'max:20'],
            'lineNo' => ['nullable', 'string', 'max:20'],
            'confirmDuplicate' => ['sometimes', 'boolean'],
        ], self::YEAR_MESSAGE);
        $data['subjectName'] = trim($data['subjectName']);

        if (! $request->boolean('confirmDuplicate')) {
            $duplicates = RegisterEntry::where('sacrament', $data['sacrament'])->whereDate('ceremony_date', $data['ceremonyDate'])
                ->where(fn ($q) => TextSearch::whereEquals($q, 'subject_name', $data['subjectName']))
                ->orderBy('register_number')->get(['id', 'register_number']);
            if ($duplicates->isNotEmpty()) {
                return response()->json([
                    'message' => 'The register already has an entry with this name and date. Add it anyway only if it is a different person.',
                    'duplicates' => $duplicates->map(fn ($d) => ['id' => $d->id, 'registerNumber' => $d->register_number])->all(),
                ], 409);
            }
        }

        $entry = $this->register->transcribe($data, $request->user());

        return $this->respond($entry)->response()->setStatusCode(201);
    }

    public function correct(Request $request, string $id)
    {
        $data = $request->validate([
            'reason' => ['required', 'string', 'max:500'],
            'subjectName' => ['required_without_all:ceremonyDate,minister,details', 'string', 'max:160'],
            'ceremonyDate' => ['required_without_all:subjectName,minister,details', 'date_format:Y-m-d', 'after_or_equal:1500-01-01', 'before_or_equal:'.ParishClock::todayString()],
            'minister' => ['required_without_all:subjectName,ceremonyDate,details', 'string', 'max:120'],
            'details' => ['required_without_all:subjectName,ceremonyDate,minister', 'array', 'max:12'],
            'details.*.label' => ['required', 'string', 'max:60'],
            'details.*.value' => ['nullable', 'string', 'max:200'],
        ], self::YEAR_MESSAGE);

        $entry = $this->register->correct(RegisterEntry::findOrFail($id), collect($data)->except('reason')->all(), $data['reason'], $request->user());

        return $this->respond($entry);
    }

    public function paperReference(Request $request, string $id)
    {
        $data = $request->validate([
            'bookNo' => ['nullable', 'string', 'max:20'],
            'pageNo' => ['nullable', 'string', 'max:20'],
            'lineNo' => ['nullable', 'string', 'max:20'],
        ]);

        return $this->respond($this->register->setPaperReference(
            RegisterEntry::findOrFail($id), $data['bookNo'] ?? null, $data['pageNo'] ?? null, $data['lineNo'] ?? null, $request->user(),
        ));
    }

    public function revoke(Request $request, string $id)
    {
        $request->validate(['reason' => ['required', 'string', 'max:500']]);

        return $this->respond($this->register->revoke(RegisterEntry::findOrFail($id), $request->string('reason')->toString(), $request->user()));
    }

    public function reinstate(Request $request, string $id)
    {
        $request->validate(['reason' => ['required', 'string', 'max:500']]);

        return $this->respond($this->register->reinstate(RegisterEntry::findOrFail($id), $request->string('reason')->toString(), $request->user()));
    }

    private function respond(RegisterEntry $entry): RegisterEntryResource
    {
        return new RegisterEntryResource($entry->load('enteredBy', 'booking:id,reference_number'));
    }

    /** Same shape as the booking history endpoint. */
    private function history(RegisterEntry $entry): array
    {
        return AuditLogResource::collection(
            AuditLog::with('actor')->where('subject_type', 'register_entry')->where('subject_id', $entry->id)
                ->orderBy('created_at')->orderBy('id')->get(),
        )->resolve();
    }
}
