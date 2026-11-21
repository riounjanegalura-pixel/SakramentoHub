<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\RegisterEntry;
use App\Services\Register\ParishRegister;
use App\Support\ParishClock;
use Illuminate\Http\Request;

/** Public: anyone holding a certificate can check it. Answers with the minimum and never says which half was wrong. */
class VerifyController extends Controller
{
    public function __invoke(Request $request)
    {
        $data = $request->validate([
            'number' => ['required', 'string', 'max:20'],
            'code' => ['required', 'string', 'max:30'],
        ]);

        $entry = RegisterEntry::where('register_number', strtoupper(trim($data['number'])))->first();
        $given = ParishRegister::normaliseCode($data['code']);

        // Compare even on a miss so a wrong number costs the same as a wrong code.
        $stored = $entry?->verify_code ?? str_repeat('-', strlen($given));
        $matches = hash_equals($stored, $given) && $entry?->verify_code !== null;

        if (! $matches) {
            return response()->json(['message' => 'No record found. Check the number and code on the certificate.'], 404, ['Cache-Control' => 'no-store']);
        }

        $snapshot = (array) $entry->snapshot;

        return response()->json([
            'status' => $entry->status,
            'parishName' => $snapshot['parishName'] ?? '',
            'sacrament' => ParishRegister::label($entry->sacrament),
            'registerNumber' => $entry->register_number,
            'subjectName' => $snapshot['subjectName'] ?? $entry->subject_name,
            'ceremonyDate' => $snapshot['ceremonyDate'] ?? $entry->ceremony_date->toDateString(),
            'minister' => $snapshot['minister'] ?? '',
            'correctedOn' => $entry->corrected_at?->setTimezone(config('app.parish_timezone'))->toDateString(),
        ], 200, ['Cache-Control' => 'no-store']);
    }
}
