<?php

namespace App\Http\Requests;

use App\Models\ParishEvent;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateParishEventRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        // Same required-field shape as CreateParishEventRequest (kept as a
        // separate class per this codebase's convention — see
        // CreateStaffUserRequest vs ChangeUserRoleRequest — since an update
        // here is a full replace of the announcement's fields, not a partial
        // PATCH of just one of them).
        //
        // An event may hold a category from before the current list (the
        // seeder's 'baptism', older rows). Editing such an event resends its
        // stored value, so that one value is accepted here too; any other
        // value outside the list is still rejected. Create stays list-only.
        $categories = config('parish_events.categories');
        $current = ParishEvent::query()->whereKey($this->route('id'))->value('category');
        if (is_string($current) && $current !== '') {
            $categories = array_values(array_unique([...$categories, $current]));
        }

        return [
            'title' => ['required', 'string', 'max:255'],
            'date' => ['required', 'date'],
            'location' => ['nullable', 'string', 'max:255'],
            'imageUrl' => ['nullable', 'string', 'max:2048'],
            'durationMinutes' => ['nullable', 'integer', 'between:15,720'],
            'blocksBookings' => ['nullable', 'boolean'],
            'category' => ['required', Rule::in($categories)],
        ];
    }
}
