# Demo data for Reports

`DemoDataSeeder` fills an empty local database with about six months of believable parish activity so the admin Reports screen has something to show: roughly 270 bookings across all six services (completed, declined, cancelled, refunded, and a few still open), GCash and cash payments, gifts, certificate requests, and register entries (including 24 older entries copied from the paper book).

It is for demos and screenshots only.

## Run it

From `backend/`, on a local or throwaway database that already has the normal seed (services and the admin account):

```
php artisan migrate --seed
php artisan db:seed --class=DemoDataSeeder
```

## On every deploy

`DatabaseSeeder` now runs `DemoDataSeeder` on every boot (`migrate --seed`), so a Render deploy, or a wake-up after the disk was reset, comes back with the sample parishioners, about 200 bookings, gifts, certificate requests and register entries (about 6 seconds). Turn it off with `SEED_DEMO_DATA=false` on the server (or `'seed_demo_data'` in `config/app.php`) for a system that should hold only real records.

## Safety

- It adds data only when its sample parishioners are missing (their emails end in `@demo.sakramentohub.test`), so booting twice does not double the data.
- If it fails, the server still starts: the error is logged as "Sample data was not added".
- In production it refuses to run unless `SEED_DEMO_DATA` is on.
- Names are a mix of regional given names and surnames, plus common Bulacan surnames (Santos, Dela Cruz, Bautista, ...). No real person is represented.

## Clean up

Rebuild the local database (`php artisan migrate:fresh --seed`). The demo parishioners all use the `@demo.sakramentohub.test` email domain and the password `password`.
