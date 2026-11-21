# Deploy target (Render, via a container image — see
# docs/DEPLOYMENT.md). Runs Laravel's own dev server, not php-fpm+nginx —
# deliberately simple for a low-traffic deployment, not a high-availability topology.
# composer.json declares php ^8.2, but composer.lock was generated on
# this dev machine's PHP 8.5 and several locked package versions (symfony
# 8.x, carbon 3.13) actually require >=8.4.1 — matching the lock here
# rather than fighting it with a downgrade.
FROM php:8.4-cli-alpine

RUN apk add --no-cache \
        sqlite \
        sqlite-dev \
        libzip-dev \
        oniguruma-dev \
    && docker-php-ext-install pdo pdo_sqlite mbstring bcmath zip \
    # The certificate QR code (bacon/bacon-qr-code) needs iconv: fail the build, not the certificate.
    && php -r "extension_loaded('iconv') || exit(1);"

# php:cli ships no php.ini, so uploads were capped at PHP's 2 MB default: a normal phone photo failed before Laravel
# (which allows 5 MB) ever saw it.
RUN { echo 'upload_max_filesize=8M'; echo 'post_max_size=10M'; echo 'memory_limit=256M'; } > /usr/local/etc/php/conf.d/uploads.ini

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app
COPY . .

RUN composer install --no-dev --optimize-autoloader --no-interaction \
    && mkdir -p database \
    && touch database/database.sqlite \
    && chmod -R 775 storage bootstrap/cache database

EXPOSE 10000

# Render sets $PORT; migrate --seed is safe to re-run (seeders use
# updateOrCreate/firstOrCreate patterns), so every boot self-heals a fresh
# or reset disk instead of crash-looping on a missing schema. storage:link
# is idempotent too (Laravel skips it if the symlink already exists) —
# without it, uploaded GCash receipts save fine but their URLs 404, since
# nothing serves storage/app/public/* at /storage/*. Run at boot, not build
# time, so it self-heals the same way migrate --seed does if the disk resets.
# register:backfill is a repair step, not a precondition: if it fails it is logged and the server still starts.
# The scheduler (php artisan schedule:work) runs in the background to execute
# scheduled commands like hold expiry on a 15-minute interval.
CMD ["sh", "-c", "php artisan storage:link && php artisan migrate --seed --force && (php artisan register:backfill || echo \"register:backfill failed\") && (php artisan schedule:work >> /proc/1/fd/2 2>&1 &) && php artisan serve --host=0.0.0.0 --port=${PORT:-10000}"]
