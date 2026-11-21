<?php

namespace Database\Factories;

use App\Models\User;
use App\Models\WalletDocument;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<WalletDocument>
 */
class WalletDocumentFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'kind' => 'birth_certificate',
            'person_name' => fake()->name(),
            'file_url' => fn (array $a) => '/documents/'.$a['user_id'].'/'.fake()->unique()->uuid().'.pdf',
            'original_name' => 'certificate.pdf',
            'mime' => 'application/pdf',
            'size_bytes' => 1024,
        ];
    }
}
