<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    'paths' => ['api/*'],

    'allowed_methods' => ['*'],

    // Both frontend apps run against this one API in dev: the parishioner PWA
    // (Vite default port) and the admin portal (fixed port 5174, see
    // admin/vite.config.ts). FRONTEND_URL lets a deployment override/extend this.
    // The two production Vercel origins are listed directly since they're the
    // permanent aliases (see docs/DEPLOYMENT.md), not per-deploy preview URLs.
    'allowed_origins' => array_filter([
        env('FRONTEND_URL'),
        'http://localhost:5173',
        'http://localhost:5174',
        'https://parishioner.vercel.app',
        'https://sakramentohub-admin.vercel.app',
    ]),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
