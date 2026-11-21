<?php

test('a failing register backfill does not stop the server booting', function () {
    $cmd = collect(file(base_path('Dockerfile')))->first(fn ($line) => str_starts_with($line, 'CMD '));

    expect($cmd)->toContain('(php artisan register:backfill || echo \\"register:backfill failed\\")')
        ->and($cmd)->toContain('php artisan storage:link && php artisan migrate --seed --force && (php artisan register:backfill')
        ->and($cmd)->toContain('&& (php artisan schedule:work >> /proc/1/fd/2 2>&1 &) && php artisan serve');
});

test('the image build context leaves out secrets, local databases, runtime files and what the build reinstalls', function () {
    $lines = array_map('trim', file(base_path('.dockerignore')));

    foreach (['.env', '.env.*', '!.env.example', 'database/*.sqlite*', 'storage/app/private/**', 'storage/logs/**', 'storage/framework/cache/**',
        'storage/framework/sessions/**', 'storage/framework/views/**', 'node_modules', 'vendor', 'tests', '.phpunit.cache'] as $entry) {
        expect($lines)->toContain($entry);
    }
});
