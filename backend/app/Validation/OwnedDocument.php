<?php

namespace App\Validation;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Facades\Storage;

/** A document reference must be a file the booking owner (or the staff member who entered it) uploaded, and it must exist. */
class OwnedDocument implements ValidationRule
{
    /** @param list<string|null> $uploaderIds the booking owner and/or the staff member who entered it */
    public function __construct(private array $uploaderIds, private bool $anyStaff = false) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $matched = null;
        foreach (array_values(array_filter($this->uploaderIds)) as $id) {
            $prefix = "/documents/{$id}/";
            if (is_string($value) && str_starts_with($value, $prefix)
                && preg_match('/^[A-Za-z0-9_-][A-Za-z0-9._-]*$/', substr($value, strlen($prefix)))) {
                $matched = $value;
                break;
            }
        }

        // A walk-in is finished by whoever is at the desk, so a file any active staff/admin uploaded counts too.
        if ($matched === null && $this->anyStaff && is_string($value)
            && preg_match('#^/documents/([0-9a-fA-F-]{36})/[A-Za-z0-9_-][A-Za-z0-9._-]*$#', $value, $m)
            && \App\Models\User::whereKey($m[1])->where('is_active', true)->whereIn('role', config('roles.staff_side'))->exists()) {
            $matched = $value;
        }

        if ($matched === null) {
            $fail('Upload this document again — the file is not linked to your account.');

            return;
        }

        if (! Storage::disk('local')->fileExists(ltrim($matched, '/'))) {
            $fail('This uploaded file could not be found. Please upload it again.');
        }
    }
}
