<?php

namespace Database\Seeders;

use App\Models\ParishSetting;
use Illuminate\Database\Seeder;

class ParishSettingSeeder extends Seeder
{
    /** firstOrCreate, not updateOrCreate: re-seeding on every container boot
     * must never overwrite a value staff changed in the settings screen. */
    public function run(): void
    {
        foreach (ParishSetting::DEFAULTS as $key => $value) {
            ParishSetting::firstOrCreate(['key' => $key], ['value' => $value]);
        }
    }
}
