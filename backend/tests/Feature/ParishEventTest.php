<?php

use Database\Seeders\ParishEventSeeder;

test('lists upcoming events seeded with Sunday Mass and Baptism Ceremony', function () {
    $this->seed(ParishEventSeeder::class);

    $this->getJson('/api/events/upcoming')
        ->assertOk()
        ->assertJsonCount(2)
        ->assertJsonFragment(['title' => 'Sunday Mass', 'category' => 'mass'])
        ->assertJsonFragment(['title' => 'Baptism Ceremony', 'category' => 'baptism']);
});

test('does not list events more than a day in the past', function () {
    \App\Models\ParishEvent::create([
        'title' => 'Old Event',
        'date' => now()->subDays(5),
        'location' => 'Main Chapel',
        'image_url' => '/x.jpg',
        'category' => 'other',
    ]);

    $this->getJson('/api/events/upcoming')
        ->assertOk()
        ->assertJsonMissing(['title' => 'Old Event']);
});
