<?php

// Regression guard. With trustProxies(at: '*'), the vendored Symfony Request::getClientIps() treats every
// entry as a trusted proxy and falls back to the rightmost one (the address Render's proxy appended), so
// $request->ip() is not the forgeable first X-Forwarded-For entry. These tests pin that behaviour; they
// would fail if the trusted-proxy setting or a framework upgrade made the first entry the throttle key.

test('rotating the first X-Forwarded-For entry does not escape the login limit', function () {
    // The proxy appends the real address last; the client chooses the first entries.
    foreach (range(1, 30) as $i) {
        $this->withHeaders(['X-Forwarded-For' => "10.0.0.{$i}, 203.0.113.50"])
            ->postJson('/api/login', ['email' => 'nobody@example.com', 'password' => 'wrong-password']);
    }

    $this->withHeaders(['X-Forwarded-For' => '10.0.0.99, 203.0.113.50'])
        ->postJson('/api/login', ['email' => 'nobody@example.com', 'password' => 'wrong-password'])
        ->assertStatus(429);
});

test('different real clients get separate buckets', function () {
    foreach (range(1, 30) as $i) {
        $this->withHeaders(['X-Forwarded-For' => "203.0.113.{$i}"])
            ->postJson('/api/login', ['email' => 'nobody@example.com', 'password' => 'wrong-password']);
    }

    $this->withHeaders(['X-Forwarded-For' => '198.51.100.7'])
        ->postJson('/api/login', ['email' => 'nobody@example.com', 'password' => 'wrong-password'])
        ->assertStatus(422); // a fresh client reaches validation, not the limiter
});
