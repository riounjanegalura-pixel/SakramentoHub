<?php

namespace App\Providers;

use App\Services\PayMongo\PayMongoClient;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\ServiceProvider;
use Symfony\Component\Mailer\Bridge\Brevo\Transport\BrevoTransportFactory;
use Symfony\Component\HttpClient\HttpClient;
use Symfony\Component\Mailer\Transport\Dsn;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Resolved fresh from config each time (bind, not singleton) so a
        // config change — e.g. a test setting credentials — always applies.
        $this->app->bind(PayMongoClient::class, fn () => PayMongoClient::fromConfig());
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        JsonResource::withoutWrapping();

        // MAIL_MAILER=brevo + BREVO_API_KEY: mail over HTTPS instead of SMTP. The client gives up on a silent server
        // after 10 seconds (20 at most), so a queue worker is never held by a hung request.
        Mail::extend('brevo', fn () => (new BrevoTransportFactory(null, HttpClient::create(['timeout' => 10, 'max_duration' => 20])))
            ->create(new Dsn('brevo+api', 'default', config('services.brevo.key'))));
    }
}
