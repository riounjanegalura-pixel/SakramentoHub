<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\BookingRuleViolation;
use App\Http\Controllers\Controller;
use App\Http\Resources\WalletDocumentResource;
use App\Models\WalletDocument;
use App\Support\StoredDocuments;
use App\Validation\OwnedDocument;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/** A parishioner's own store of documents they will need again (parishioner role only). */
class WalletController extends Controller
{
    public function index(Request $request)
    {
        return WalletDocumentResource::collection(
            WalletDocument::where('user_id', $request->user()->id)->orderByDesc('created_at')->orderByDesc('id')->get()
        );
    }

    /** Takes a new `file` (stored like POST /documents) or the address of an upload already in the user's own folder. */
    public function store(Request $request)
    {
        $user = $request->user();
        $data = $request->validate([
            'file' => ['required_without:fileUrl', 'file', 'max:5120', 'mimes:jpg,jpeg,png,pdf'],
            'fileUrl' => ['required_without:file', 'string', new OwnedDocument([$user->id])],
            'kind' => ['required', Rule::in(WalletDocument::KINDS)],
            'personName' => ['required', 'string', 'max:120'],
        ]);

        if ($request->hasFile('file')) {
            $this->assertRoom($user->id);
            $upload = $request->file('file');
            $path = $upload->store("documents/{$user->id}", 'local');
            $attributes = [
                'file_url' => "/documents/{$user->id}/".basename($path),
                'original_name' => mb_substr($upload->getClientOriginalName(), 0, 255),
                'mime' => (string) $upload->getMimeType(),
                'size_bytes' => (int) $upload->getSize(),
            ];
        } else {
            $existing = WalletDocument::where('user_id', $user->id)->where('file_url', $data['fileUrl'])->first();
            if ($existing !== null) {
                return new WalletDocumentResource($existing);
            }
            $this->assertRoom($user->id);
            $path = ltrim($data['fileUrl'], '/');
            $attributes = [
                'file_url' => $data['fileUrl'],
                'original_name' => basename($path),
                'mime' => (string) Storage::disk('local')->mimeType($path),
                'size_bytes' => (int) Storage::disk('local')->size($path),
            ];
        }

        $attributes += ['user_id' => $user->id, 'kind' => $data['kind'], 'person_name' => $data['personName']];
        $document = WalletDocument::create($attributes);

        return (new WalletDocumentResource($document))->response()->setStatusCode(201);
    }

    public function destroy(Request $request, string $id)
    {
        $document = WalletDocument::where('user_id', $request->user()->id)->findOrFail($id);
        $document->delete();
        StoredDocuments::deleteIfUnreferenced($document->file_url);

        return response()->noContent();
    }

    private function assertRoom(string $userId): void
    {
        if (WalletDocument::where('user_id', $userId)->count() >= WalletDocument::LIMIT) {
            throw new BookingRuleViolation('Your wallet is full ('.WalletDocument::LIMIT.' documents). Delete one to add another.');
        }
    }
}
