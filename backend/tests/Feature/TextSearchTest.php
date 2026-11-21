<?php

use App\Models\User;
use App\Support\TextSearch;

function searchNames(string $term): array
{
    return User::query()->where(fn ($q) => TextSearch::orContains($q, 'full_name', $term))->pluck('full_name')->all();
}

test('the escape character is one MySQL and SQLite both read the same way', function () {
    $sql = User::query()->where(fn ($q) => TextSearch::orContains($q, 'full_name', 'x'))->toRawSql();

    expect($sql)->toContain("ESCAPE '!'")->not->toContain("ESCAPE '\\'");
});

test('a term with LIKE wildcards, the escape character or a backslash matches literally and does not error', function (string $term, string $stored, string $other) {
    User::factory()->create(['full_name' => $stored]);
    User::factory()->create(['full_name' => $other]);

    expect(searchNames($term))->toBe([$stored]);
})->with([
    'percent' => ['50%', 'Gift 50% off', 'Gift 500 off'],
    'underscore' => ['a_b', 'Mr a_b', 'Mr axb'],
    'bang' => ['hi!', 'Say hi! now', 'Say hit now'],
    'backslash' => ['a\\b', 'Path a\\b here', 'Path ab here'],
    'all four' => ['%_!\\', 'odd %_!\\ name', 'odd abcd name'],
]);
