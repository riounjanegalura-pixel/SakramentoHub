<?php

namespace Database\Factories;

use App\Models\RegisterEntry;
use App\Services\Register\ParishRegister;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<RegisterEntry>
 */
class RegisterEntryFactory extends Factory
{
    public function definition(): array
    {
        return [
            'sacrament' => 'baptism',
            'year' => 2026,
            'sequence' => fn () => fake()->unique()->numberBetween(1, 9999),
            'register_number' => fn (array $a) => sprintf('%s-%d-%04d', ParishRegister::prefix($a['sacrament']), $a['year'], $a['sequence']),
            'verify_code' => 'ABCDEFGHJKMN',
            'source' => 'system',
            'subject_name' => fn () => fake()->name(),
            'ceremony_date' => '2026-03-14',
            'snapshot' => fn (array $a) => [
                'subjectName' => $a['subject_name'],
                'ceremonyDate' => $a['ceremony_date'],
                'minister' => 'Rev. Fr. Leopoldo S. Evangelista',
                'parishName' => 'St. Peter the Apostle Parish',
                'parishAddress' => 'Balagtas, Bulacan',
                'title' => 'Certificate of Baptism',
                'statement' => 'has been baptised according to the rite of the Roman Catholic Church.',
                'details' => [],
            ],
            'status' => 'valid',
        ];
    }
}
