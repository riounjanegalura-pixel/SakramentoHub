<?php

namespace Database\Seeders;

use App\Models\Service;
use Illuminate\Database\Seeder;

/**
 * firstOrCreate, not updateOrCreate: the container re-seeds on every boot and
 * must never overwrite a fee or rule staff changed in Settings.
 */
class ServiceSeeder extends Seeder
{
    public function run(): void
    {
        $services = [
            ['id' => 'baptism', 'sacrament' => 'baptism', 'name' => 'Baptism', 'description' => "Schedule your child's baptism ceremony", 'price_centavos' => 5000],
            ['id' => 'confirmation', 'sacrament' => 'confirmation', 'name' => 'Confirmation', 'description' => 'Schedule the Sacrament of Confirmation', 'price_centavos' => null],
            ['id' => 'wedding', 'sacrament' => 'wedding', 'name' => 'Wedding', 'description' => 'Book your wedding ceremony', 'price_centavos' => 500000],
            ['id' => 'funeral', 'sacrament' => 'funeral', 'name' => 'Funeral Mass', 'description' => 'Arrange a funeral mass service', 'price_centavos' => null],
            ['id' => 'anointing', 'sacrament' => 'anointing', 'name' => 'Anointing of the Sick', 'description' => 'Request anointing for the ill', 'price_centavos' => null],
            ['id' => 'house-blessing', 'sacrament' => 'house-blessing', 'name' => 'House Blessing & Other', 'description' => 'Book house blessing or other services', 'price_centavos' => null],
        ];

        foreach ($services as $service) {
            Service::firstOrCreate(
                ['id' => $service['id']],
                array_merge($service, ServiceSchedulingDefaults::BY_SERVICE[$service['id']]),
            );
        }
    }
}
