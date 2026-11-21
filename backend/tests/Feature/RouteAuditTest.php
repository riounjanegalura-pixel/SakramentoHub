<?php

test('every endpoint in docs/api-contract.md is registered', function () {
    $routes = collect(app('router')->getRoutes())->map(
        fn ($r) => strtoupper($r->methods()[0]).' /'.$r->uri()
    )->values()->all();

    $expected = [
        'POST /api/register',
        'POST /api/login',
        'POST /api/logout',
        'POST /api/forgot-password',
        'POST /api/reset-password',
        'POST /api/verify',
        'POST /api/email/verify',
        'POST /api/email/verification-notification',
        'POST /api/email/verify-code',
        'GET /api/me',
        'PATCH /api/me',
        'PATCH /api/me/password',
        'GET /api/me/export',
        'DELETE /api/me',
        'GET /api/services',
        'GET /api/services/{id}',
        'GET /api/services/{id}/requirements',
        'GET /api/services/{sacrament}/availability',
        'GET /api/services/{sacrament}/availability-range',
        'GET /api/parish',
        'POST /api/bookings',
        'GET /api/bookings',
        'GET /api/bookings/{id}',
        'PATCH /api/bookings/{id}',
        'PATCH /api/bookings/{id}/cancel',
        'PATCH /api/bookings/{id}/submit',
        'PATCH /api/bookings/{id}/reschedule',
        'POST /api/bookings/{id}/payment',
        'POST /api/bookings/{id}/payment/cash',
        'POST /api/webhooks/paymongo',
        'POST /api/donations',
        'GET /api/bookings/{id}/certificate',
        'GET /api/register-entries',
        'GET /api/register-entries/{id}/certificate',
        'GET /api/wallet',
        'POST /api/wallet',
        'DELETE /api/wallet/{id}',
        'GET /api/certificate-requests',
        'POST /api/certificate-requests',
        'GET /api/certificate-requests/{id}',
        'POST /api/certificate-requests/{id}/cancel',
        'POST /api/documents',
        'GET /api/documents/{userId}/{filename}',
        'GET /api/events/upcoming',
        'GET /api/notification-preferences',
        'PATCH /api/notification-preferences',
        'GET /api/notifications',
        'POST /api/notifications/mark-all-read',
        'GET /api/admin/bookings',
        'GET /api/admin/bookings/{id}',
        'PATCH /api/admin/bookings/{id}/approve',
        'PATCH /api/admin/bookings/{id}/decline',
        'PATCH /api/admin/bookings/{id}/return',
        'PATCH /api/admin/bookings/{id}/cancel',
        'PATCH /api/admin/bookings/{id}/refund',
        'PATCH /api/admin/bookings/{id}/cash-received',
        'PATCH /api/admin/bookings/{id}/complete',
        'GET /api/admin/bookings/{id}/certificate',
        'GET /api/admin/register',
        'POST /api/admin/register',
        'GET /api/admin/register/{id}',
        'GET /api/admin/register/{id}/certificate',
        'PATCH /api/admin/register/{id}',
        'PATCH /api/admin/register/{id}/paper-reference',
        'POST /api/admin/register/{id}/revoke',
        'POST /api/admin/register/{id}/reinstate',
        'GET /api/admin/certificate-requests',
        'GET /api/admin/certificate-requests/{id}',
        'POST /api/admin/certificate-requests/{id}/issue',
        'POST /api/admin/certificate-requests/{id}/decline',
        'GET /api/admin/audit-log',
        'GET /api/admin/analytics',
        'GET /api/admin/users',
        'POST /api/admin/users',
        'PATCH /api/admin/users/{id}/role',
        'PATCH /api/admin/users/{id}/deactivate',
        'PATCH /api/admin/users/{id}/activate',
        'GET /api/admin/parish-events',
        'POST /api/admin/parish-events',
        'PATCH /api/admin/parish-events/{id}',
        'DELETE /api/admin/parish-events/{id}',
        'PUT /api/admin/bookings/{id}/documents/{key}',
        'GET /api/admin/bookings/{id}/notes',
        'POST /api/admin/bookings/{id}/notes',
        'GET /api/admin/bookings/{id}/history',
        'PATCH /api/admin/bookings/{id}/reschedule',
        'PATCH /api/admin/bookings/{id}/partial-refund',
        'POST /api/admin/bookings/{id}/payment',
        'POST /api/admin/walk-ins',
        'PATCH /api/admin/walk-ins/{id}',
        'PATCH /api/admin/walk-ins/{id}/submit',
        'GET /api/admin/parishioners/lookup',
        'GET /api/admin/schedule',
        'GET /api/admin/settings',
        'PATCH /api/admin/settings/parish',
        'PATCH /api/admin/settings/services/{id}',
        'GET /api/admin/blackouts',
        'POST /api/admin/blackouts',
        'DELETE /api/admin/blackouts/{id}',
        'GET /api/admin/reports/summary',
        'GET /api/admin/reports/bookings.csv',
        'GET /api/admin/bookings/counts',
        'GET /api/admin/bookings/by-reference/{reference}',
        'POST /api/admin/bookings/{id}/check-in',
        'PUT /api/bookings/{id}/documents/{key}',
        'POST /api/admin/bookings/{id}/documents/{key}/attach',
        'PUT /api/admin/bookings/{id}/milestones/{key}',
        'POST /api/notifications/{id}/read',
    ];

    foreach ($expected as $route) {
        expect($routes)->toContain($route);
    }
});

test('every authenticated route is rate-limited, not just login/register', function () {
    $routes = collect(app('router')->getRoutes())->filter(
        fn ($r) => in_array('auth:sanctum', $r->middleware(), true)
    );

    expect($routes)->not->toBeEmpty();

    foreach ($routes as $route) {
        $hasThrottle = collect($route->middleware())->contains(
            fn ($m) => str_starts_with($m, 'throttle:')
        );
        expect($hasThrottle)
            ->toBeTrue("Route {$route->methods()[0]} /{$route->uri()} has no throttle middleware.");
    }
});

test('the upload endpoints have a tighter throttle than the general authenticated group', function () {
    $documentsRoute = collect(app('router')->getRoutes())->first(
        fn ($r) => $r->uri() === 'api/documents'
    );

    expect($documentsRoute->middleware())->toContain('throttle:40,1,document-upload');
});

test('the payment-initiation endpoint has its own tighter throttle', function () {
    $route = collect(app('router')->getRoutes())->first(
        fn ($r) => $r->uri() === 'api/bookings/{id}/payment'
    );

    expect($route->middleware())->toContain('throttle:10,1,parishioner-payment');
});

test('the PayMongo webhook is not behind sanctum auth but is still throttled', function () {
    $route = collect(app('router')->getRoutes())->first(
        fn ($r) => $r->uri() === 'api/webhooks/paymongo'
    );

    expect($route->middleware())->not->toContain('auth:sanctum');
    expect($route->middleware())->toContain('throttle:120,1');
});

/** @return array<string, list<string>> "METHOD /uri" => middleware, for every /api route */
function routeMiddleware(): array
{
    $map = [];
    foreach (app('router')->getRoutes() as $route) {
        foreach ($route->methods() as $method) {
            if ($method !== 'HEAD') {
                $map["{$method} /{$route->uri()}"] = array_map('strval', $route->gatherMiddleware());
            }
        }
    }

    return $map;
}

test('every admin route is behind sanctum, an active account and the staff role, and is throttled', function () {
    $admin = collect(routeMiddleware())->filter(fn ($m, $key) => str_contains($key, ' /api/admin/'));
    expect($admin->count())->toBeGreaterThan(40);

    foreach ($admin as $key => $middleware) {
        expect(in_array('auth:sanctum', $middleware, true))->toBeTrue("{$key} lacks auth:sanctum");
        expect(in_array('active', $middleware, true))->toBeTrue("{$key} lacks the active check");
        expect(collect($middleware)->contains(fn ($m) => str_starts_with($m, 'role:staff,admin') || $m === 'role:admin'))
            ->toBeTrue("{$key} has no role gate");
        expect(collect($middleware)->contains(fn ($m) => str_starts_with($m, 'throttle:')))->toBeTrue("{$key} has no throttle");
    }
});

test('user management, settings writes and register corrections are admin-only; everything else under admin is staff or admin', function () {
    $adminOnly = [
        'GET /api/admin/users', 'POST /api/admin/users',
        'PATCH /api/admin/users/{id}/role', 'PATCH /api/admin/users/{id}/deactivate', 'PATCH /api/admin/users/{id}/activate',
        'PATCH /api/admin/settings/parish', 'PATCH /api/admin/settings/services/{id}',
        'PATCH /api/admin/register/{id}', 'POST /api/admin/register/{id}/revoke', 'POST /api/admin/register/{id}/reinstate',
    ];

    foreach (routeMiddleware() as $key => $middleware) {
        if (! str_contains($key, ' /api/admin/')) {
            continue;
        }
        in_array($key, $adminOnly, true)
            ? expect($middleware)->toContain('role:admin')->not->toContain('role:staff,admin')
            : expect($middleware)->toContain('role:staff,admin');
    }
});

test('the office-operations routes that need their own throttle counter have one', function () {
    $map = routeMiddleware();

    expect($map['POST /api/admin/bookings/{id}/payment'])->toContain('throttle:10,1,staff-payment')
        ->and($map['GET /api/admin/parishioners/lookup'])->toContain('throttle:30,1,parishioner-lookup')
        ->and($map['POST /api/bookings/{id}/payment'])->toContain('throttle:10,1,parishioner-payment')
        ->and($map['PUT /api/admin/bookings/{id}/documents/{key}'])->toContain('throttle:120,1,staff-document-review')
        ->and($map['POST /api/wallet'])->toContain('throttle:40,1,document-upload')
        ->and($map['POST /api/certificate-requests'])->toContain('throttle:10,1,certificate-request');

    // The review route leaves the group's shared 60 a minute, or its own 120 could never be reached.
    $review = collect(app('router')->getRoutes())->first(fn ($r) => $r->uri() === 'api/admin/bookings/{id}/documents/{key}');
    expect($review->excludedMiddleware())->toContain('throttle:60,1');
});

test('the new notification and walk-in routes sit in the authenticated groups', function () {
    $map = routeMiddleware();

    foreach (['POST /api/notifications/{id}/read', 'POST /api/notifications/mark-all-read'] as $key) {
        expect($map[$key])->toContain('auth:sanctum')->toContain('active')->not->toContain('role:staff,admin');
    }
    foreach (['POST /api/admin/walk-ins', 'PATCH /api/admin/walk-ins/{id}', 'PATCH /api/admin/walk-ins/{id}/submit'] as $key) {
        expect($map[$key])->toContain('auth:sanctum')->toContain('role:staff,admin');
    }
});

test('the wedding preparation routes: the owner adds a later document, the office ticks steps and attaches for walk-ins', function () {
    $map = routeMiddleware();

    expect($map['PUT /api/bookings/{id}/documents/{key}'])->toContain('auth:sanctum')->toContain('active')->toContain('throttle:60,1')
        ->not->toContain('role:staff,admin');
    foreach (['PUT /api/admin/bookings/{id}/milestones/{key}', 'POST /api/admin/bookings/{id}/documents/{key}/attach'] as $key) {
        expect($map[$key])->toContain('auth:sanctum')->toContain('active')->toContain('role:staff,admin')->toContain('throttle:60,1')->not->toContain('role:admin');
    }
});

test('the certificate request routes are for parishioners, and the office ones are for staff', function () {
    $map = routeMiddleware();

    foreach (['GET /api/certificate-requests', 'POST /api/certificate-requests', 'GET /api/certificate-requests/{id}', 'POST /api/certificate-requests/{id}/cancel'] as $key) {
        expect($map[$key])->toContain('auth:sanctum')->toContain('active')->toContain('role:parishioner');
    }
    foreach (['GET /api/admin/certificate-requests', 'GET /api/admin/certificate-requests/{id}', 'POST /api/admin/certificate-requests/{id}/issue', 'POST /api/admin/certificate-requests/{id}/decline'] as $key) {
        expect($map[$key])->toContain('role:staff,admin')->not->toContain('role:admin');
    }
});
