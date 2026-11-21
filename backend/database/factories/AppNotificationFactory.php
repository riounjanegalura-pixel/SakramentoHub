<?php

namespace Database\Factories;

use App\Models\AppNotification;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AppNotification>
 */
class AppNotificationFactory extends Factory
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
            'title' => fake()->sentence(3),
            'body' => fake()->sentence(),
            'category' => 'today',
            'read' => false,
            'icon' => 'calendar',
        ];
    }
}
