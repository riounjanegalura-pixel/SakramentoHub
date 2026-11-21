<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'brevo' => [
        'key' => env('BREVO_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    // Optional SMS for the demo's one-time code, TextBee (https://textbee.dev), where your own Android phone
    // and SIM send the text. Free (300 messages a month), no Sender ID, reaches any network; the phone must stay on and online.
    // `device_id` is optional.
    'textbee' => [
        'api_key' => env('TEXTBEE_API_KEY'),
        'device_id' => env('TEXTBEE_DEVICE_ID'),
        'base_url' => env('TEXTBEE_BASE_URL', 'https://api.textbee.dev/api/v1'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];
