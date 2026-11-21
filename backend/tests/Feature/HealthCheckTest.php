<?php

test('health check responds ok', function () {
    $this->getJson('/api/health')
        ->assertOk()
        ->assertJson(['status' => 'ok']);
});
