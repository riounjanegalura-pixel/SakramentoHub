<?php

namespace App\Http\Controllers\Api\Admin;

use App\Enums\BookingStatus;
use App\Exceptions\BookingRuleViolation;
use App\Http\Controllers\Controller;
use App\Http\Requests\CreateBookingRequest;
use App\Http\Resources\AdminBookingResource;
use App\Models\Booking;
use App\Models\Service;
use App\Models\User;
use App\Services\Booking\BookingStateMachine;
use App\Services\Booking\DraftEditor;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Bookings the office enters for someone at the counter (spec §6). They run
 * through the same DraftEditor, SacramentRules, SchedulingService and
 * BookingStateMachine as online bookings — there is no second set of rules.
 * The contact lives in owner_snapshot; an account is attached only when staff
 * pass the id they confirmed through lookup(), never from an email alone.
 */
class WalkInController extends Controller
{
    public function __construct(private BookingStateMachine $bookings, private DraftEditor $editor) {}

    /** What the walk-in form must ask for this sacrament: the server's own rules, as a field list. */
    public function fields(string $sacrament)
    {
        abort_unless(Service::whereKey($sacrament)->exists(), 404);

        return response()->json(\App\Validation\FieldSchema::for($sacrament));
    }

    public function store(Request $request)
    {
        $request->validate(['sacrament' => ['required', Rule::exists('services', 'id')]] + $this->rules(creating: true));

        $booking = new Booking([
            'user_id' => $request->input('linkUserId'),
            'sacrament' => $request->string('sacrament')->toString(),
            'status' => BookingStatus::Draft,
            'channel' => 'walk_in',
            'created_by' => $request->user()->id,
            'owner_snapshot' => $this->contact($request),
            'form_data' => [],
        ]);
        $this->editor->apply($booking, $request);

        return (new AdminBookingResource($this->reload($booking)))->response()->setStatusCode(201);
    }

    public function update(Request $request, string $id)
    {
        $request->validate($this->rules(creating: false));
        $booking = $this->editable($id);

        if ($request->has('contact')) {
            $booking->owner_snapshot = $this->contact($request);
        }
        if ($request->exists('linkUserId')) {
            $booking->user_id = $request->input('linkUserId');
        }
        $this->editor->apply($booking, $request);

        return new AdminBookingResource($this->reload($booking));
    }

    public function submit(Request $request, string $id)
    {
        $request->validate([
            'waiveLeadTime' => ['sometimes', 'boolean'],
            'waiveReason' => ['required_if_accepted:waiveLeadTime', 'nullable', 'string', 'max:500'],
        ]);
        $booking = $this->editable($id);
        $waive = $request->boolean('waiveLeadTime');

        $submitted = $this->bookings->submit(
            $booking, $request->user(), $waive, $waive ? trim((string) $request->input('waiveReason')) : null,
        );

        return new AdminBookingResource($this->reload($submitted));
    }

    /** The account a walk-in may be linked to — staff see the name and confirm before linking. */
    public function lookup(Request $request)
    {
        $request->validate(['email' => ['required', 'email', 'max:255']]);

        $user = $this->linkable()
            ->whereRaw('LOWER(email) = ?', [mb_strtolower(trim($request->string('email')->toString()))])
            ->first();

        return $user
            ? response()->json(['id' => $user->id, 'fullName' => $user->full_name])
            : response()->json(['message' => 'No parishioner account uses that email.'], 404);
    }

    /** Accounts a walk-in may be attached to: active, verified parishioners. */
    private function linkable()
    {
        return User::query()->where('role', 'parishioner')->where('is_active', true)->whereNotNull('email_verified_at');
    }

    private function editable(string $id): Booking
    {
        $booking = Booking::findOrFail($id);
        if ($booking->channel !== 'walk_in' || ! in_array($booking->status, [BookingStatus::Draft, BookingStatus::Returned], true)) {
            throw new BookingRuleViolation('Only a walk-in draft or a returned walk-in can be edited here.');
        }

        return $booking;
    }

    private function reload(Booking $booking): Booking
    {
        return $booking->fresh()->load('user', 'creator');
    }

    /** @return array{fullName: string, phone: string, email: ?string, relationship: ?string} */
    private function contact(Request $request): array
    {
        $email = trim((string) $request->input('contact.email'));
        $relationship = trim((string) $request->input('contact.relationship'));

        return [
            'fullName' => trim((string) $request->input('contact.fullName')),
            'phone' => (string) $request->input('contact.phone'),
            'email' => $email !== '' ? $email : null,
            'relationship' => $relationship !== '' ? $relationship : null,
        ];
    }

    private function rules(bool $creating): array
    {
        $need = $creating ? 'required' : 'required_with:contact';

        return CreateBookingRequest::draftRules() + [
            'contact' => [$creating ? 'required' : 'sometimes', 'array', 'min:1'],
            'contact.fullName' => [$need, 'string', 'max:120'],
            'contact.phone' => [$need, 'string', 'regex:/^09\d{9}$/'],
            'contact.email' => ['nullable', 'email', 'max:255'],
            'contact.relationship' => ['nullable', 'string', 'max:80'],
            'linkUserId' => ['nullable', 'string', Rule::exists('users', 'id')
                ->where('role', 'parishioner')->where('is_active', true)->whereNotNull('email_verified_at')],
        ];
    }
}
