<?php

use App\Models\ParishSetting;
use App\Models\RegisterEntry;
use App\Services\Register\ParishRegister;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

function takeNumber(string $sacrament, int $year): array
{
    return DB::transaction(fn () => app(ParishRegister::class)->nextNumber($sacrament, $year));
}

test('the first number of a register and year is 0001, then 0002', function () {
    expect(takeNumber('baptism', 2026))->toBe(['sequence' => 1, 'number' => 'BAP-2026-0001'])
        ->and(takeNumber('baptism', 2026))->toBe(['sequence' => 2, 'number' => 'BAP-2026-0002']);
});

test('a different year or register starts again at 0001', function () {
    takeNumber('baptism', 2026);
    expect(takeNumber('baptism', 2025)['number'])->toBe('BAP-2025-0001')
        ->and(takeNumber('wedding', 2026)['number'])->toBe('MAR-2026-0001');
});

test('prefixes and labels cover every register and fall back to SVC', function () {
    expect(ParishRegister::prefix('confirmation'))->toBe('CON')
        ->and(ParishRegister::prefix('funeral'))->toBe('DEA')
        ->and(ParishRegister::prefix('anointing'))->toBe('ANO')
        ->and(ParishRegister::prefix('house-blessing'))->toBe('BLS')
        ->and(ParishRegister::prefix('mystery'))->toBe('SVC')
        ->and(ParishRegister::label('wedding'))->toBe('Marriage')
        ->and(ParishRegister::label('funeral'))->toBe('Death')
        ->and(ParishRegister::label('anointing'))->toBe('Anointing of the Sick')
        ->and(ParishRegister::label('house-blessing'))->toBe('Blessing')
        ->and(ParishRegister::label('mystery'))->toBe('Service');
    expect(takeNumber('mystery', 2026)['number'])->toBe('SVC-2026-0001');
});

test('a transaction that takes a number and then fails leaves no gap', function () {
    try {
        DB::transaction(function () {
            app(ParishRegister::class)->nextNumber('baptism', 2026);
            throw new RuntimeException('boom');
        });
    } catch (RuntimeException) {
    }

    expect(takeNumber('baptism', 2026)['number'])->toBe('BAP-2026-0001');
});

test('the unique index refuses a duplicate sacrament, year and sequence', function () {
    $make = fn () => RegisterEntry::factory()->create(['sacrament' => 'baptism', 'year' => 2026, 'sequence' => 1]);
    $make();
    expect(fn () => RegisterEntry::factory()->create(['sacrament' => 'baptism', 'year' => 2026, 'sequence' => 1]))
        ->toThrow(QueryException::class);
});

test('nextNumber outside a transaction is refused', function () {
    // RefreshDatabase wraps every test in a transaction; step out of it to test the guard, then back in.
    DB::rollBack();
    try {
        expect(fn () => app(ParishRegister::class)->nextNumber('baptism', 2026))->toThrow(LogicException::class);
    } finally {
        DB::beginTransaction();
    }
});

test('verification codes are normalised and formatted', function () {
    expect(ParishRegister::normaliseCode(' abcd-efgh jkmn '))->toBe('ABCDEFGHJKMN')
        ->and(ParishRegister::formatCode('ABCDEFGHJKMN'))->toBe('ABCD-EFGH-JKMN')
        ->and(ParishRegister::formatCode(null))->toBeNull();
});

test('the parish address defaults to Balagtas, Bulacan', function () {
    $this->seed(\Database\Seeders\ParishSettingSeeder::class);
    expect(ParishSetting::parishAddress())->toBe('Balagtas, Bulacan');
});

test('SQLite waits for the write lock instead of failing', function () {
    expect(config('database.connections.sqlite.transaction_mode'))->toBe('IMMEDIATE')
        ->and(config('database.connections.sqlite.busy_timeout'))->toBe(5000);
});
