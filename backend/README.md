# SakramentoHub API

Laravel 12 + Sanctum backend for the parishioner PWA (`../parishioner/`).

## Setup

    composer install
    cp .env.example .env
    php artisan key:generate
    php artisan migrate --seed
    php artisan storage:link   # one-time, creates public/storage symlink for uploaded receipts

Parish events are seeded relative to "now" at seed time (next Sunday 8am for
Mass, +6 days 9am for the Baptism ceremony), mirroring the frontend mock's
relative-date logic. Re-run `php artisan db:seed --class=ParishEventSeeder`
to refresh those dates for demo purposes. A real production seed would
instead be driven by actual parish-office-entered event records.

`NotificationSeeder` is not part of the default seed run because it depends
on users already existing. After at least one user has registered, run
`php artisan db:seed --class=NotificationSeeder` to create demo notifications
for every existing user.

## Run

    php artisan serve   # http://127.0.0.1:8000

## Test

    php artisan test

## Point the frontend at this API

In `../parishioner/.env.local`:

    VITE_API_URL=http://127.0.0.1:8000/api

Without that variable set, the frontend uses its mock data layer and
this backend is not needed for local frontend development.
