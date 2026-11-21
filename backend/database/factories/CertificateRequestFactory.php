<?php

namespace Database\Factories;

use App\Models\CertificateRequest;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CertificateRequest>
 */
class CertificateRequestFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'owner_snapshot' => null,
            'sacrament' => 'baptism',
            'person_name' => fake()->name(),
            'sacrament_date_text' => 'May 1998',
            'details' => ['fatherName' => null, 'motherName' => null, 'spouseName' => null],
            'relationship' => 'self',
            'purpose' => 'Marriage requirement',
            'id_url' => fn (array $a) => '/documents/'.$a['user_id'].'/'.fake()->unique()->uuid().'.jpg',
            'status' => 'submitted',
        ];
    }
}
