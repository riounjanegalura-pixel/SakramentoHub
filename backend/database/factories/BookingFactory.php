<?php

namespace Database\Factories;

use App\Models\Booking;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Booking>
 */
class BookingFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => \App\Models\User::factory(),
            'sacrament' => 'baptism',
            'status' => \App\Enums\BookingStatus::Draft,
            'form_data' => [],
        ];
    }

    /** @param array{fullName?: string, phone?: string, email?: string|null} $contact */
    public function walkIn(\App\Models\User $staff, array $contact = []): static
    {
        return $this->state(fn () => [
            'user_id' => null,
            'channel' => 'walk_in',
            'created_by' => $staff->id,
            'owner_snapshot' => $contact + ['fullName' => 'Walk-in Person', 'phone' => '09170000000', 'email' => null],
        ]);
    }

    public function scheduled(string $date, string $start, string $end): static
    {
        return $this->state(fn () => [
            'appointment_date' => $date,
            'appointment_start' => $start,
            'appointment_end' => $end,
        ]);
    }
}
