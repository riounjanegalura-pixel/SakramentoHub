<?php

use App\Http\Controllers\Api\Admin\AnalyticsController;
use App\Http\Controllers\Api\Admin\AuditLogController;
use App\Http\Controllers\Api\Admin\BlackoutDateController;
use App\Http\Controllers\Api\Admin\CertificateRequestController as AdminCertificateRequestController;
use App\Http\Controllers\Api\Admin\RegisterController;
use App\Http\Controllers\Api\Admin\ReportController;
use App\Http\Controllers\Api\Admin\SettingsController;
use App\Http\Controllers\Api\Admin\BookingController as AdminBookingController;
use App\Http\Controllers\Api\Admin\ParishEventController as AdminParishEventController;
use App\Http\Controllers\Api\Admin\UserController as AdminUserController;
use App\Http\Controllers\Api\Admin\WalkInController;
use App\Http\Controllers\Api\AccountController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AvailabilityController;
use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\Api\CertificateRequestController;
use App\Http\Controllers\Api\DocumentController;
use App\Http\Controllers\Api\DonationController;
use App\Http\Controllers\Api\EmailVerificationController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\ParishEventController;
use App\Http\Controllers\Api\PaymentController;
use App\Http\Controllers\Api\SimulatedPaymentController;
use App\Http\Controllers\Api\PayMongoWebhookController;
use App\Http\Controllers\Api\ProfileController;
use App\Http\Controllers\Api\RegisterEntryController;
use App\Http\Controllers\Api\ServiceController;
use App\Http\Controllers\Api\VerifyController;
use App\Http\Controllers\Api\WalletController;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    return response()->json(['status' => 'ok']);
});

Route::get('/services', [ServiceController::class, 'index']);
Route::get('/services/{id}', [ServiceController::class, 'show']);
Route::get('/services/{id}/requirements', [ServiceController::class, 'requirements']);
Route::get('/parish', [\App\Http\Controllers\Api\ParishController::class, 'show']);

Route::get('/events/upcoming', [ParishEventController::class, 'upcoming']);

// Public, like /services — exposes counts only, no PII. Needed so the
// booking wizard can show real slot availability before a date is even
// picked, not after the parishioner has already committed to a choice.
Route::get('/services/{sacrament}/availability', [AvailabilityController::class, 'show']);
// Same counts for a whole date range, so the wizard's calendar can color a
// month in one request rather than one request per day.
Route::get('/services/{sacrament}/availability-range', [AvailabilityController::class, 'range']);

// Rate-limited to blunt credential-stuffing/brute-force attempts against
// unauthenticated endpoints — 10 attempts/minute per IP is generous enough
// for a genuine typo-and-retry, tight enough to make guessing impractical.
// Sign-in has its own counter (30/minute per IP): sharing one with register and forgot-password locked people out of
// a correct password on a shared network, and a parish office or a class testing together is one IP.
Route::middleware('throttle:30,1,login')->post('/login', [AuthController::class, 'login']);

Route::middleware('throttle:10,1')->group(function () {
    Route::post('/register', [AuthController::class, 'register']);
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword']);
    Route::post('/reset-password', [AuthController::class, 'resetPassword']);
    // Token+email act as the credential here, same as reset-password — no
    // auth required, just the same rate limit against guessing.
    Route::post('/email/verify', [EmailVerificationController::class, 'verify']);
});

// Public certificate check: number + code from the printed certificate. Tight throttle
// (20/min per IP) so the code cannot be guessed; the 12-character code is the secret.
Route::middleware('throttle:20,1,certificate-verify')->post('/verify', VerifyController::class);

// PayMongo calls this server-to-server, so there's no user/token — it's
// authenticated by the Paymongo-Signature HMAC instead, verified inside the
// controller (fails closed if no webhook secret is configured). Throttled
// generously: PayMongo retries failed deliveries, and we don't want to 429
// a legitimate burst of them.
Route::middleware('throttle:120,1')->post('/webhooks/paymongo', PayMongoWebhookController::class);

// Support our parish: a GCash gift of a chosen amount. Public (a donor needs no account); throttled per IP.
Route::middleware('throttle:10,1,donation')->post('/donations', [DonationController::class, 'store']);
Route::middleware('throttle:60,1,donation-status')->get('/donations/{id}', [DonationController::class, 'show']);
// 60 requests/minute per authenticated user for everything else — previously
// only /register and /login were rate-limited at all, so any authenticated
// endpoint (receipt/document upload in particular: 5MB per call, no quota on
// the disk it writes to) could be hit an unlimited number of times.
Route::middleware(['auth:sanctum', 'active', 'throttle:60,1'])->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::get('/me', [AuthController::class, 'me']);
    Route::patch('/me', [ProfileController::class, 'update']);
    Route::patch('/me/password', [ProfileController::class, 'changePassword']);
    // Item 11's remainder — RA 10173 self-service access/deletion rights.
    // GET (not POST) for the export since it's a pure, side-effect-free read.
    Route::get('/me/export', [AccountController::class, 'export']);
    Route::delete('/me', [AccountController::class, 'destroy']);

    // Tighter throttle than the general authenticated group — matches the
    // receipt/document upload pattern below, this one guards against
    // spamming the notification/mail log rather than disk writes.
    Route::middleware('throttle:6,1,verification-resend')->group(function () {
        Route::post('/email/verification-notification', [EmailVerificationController::class, 'resend']);
    });
    // The typed code: 8 tries a minute keeps a 6-digit code out of reach within its 60-minute life.
    Route::middleware('throttle:8,1,verification-code')->post('/email/verify-code', [EmailVerificationController::class, 'verifyCode']);

    Route::post('/bookings', [BookingController::class, 'store']);
    Route::get('/bookings', [BookingController::class, 'index']);
    Route::get('/bookings/{id}', [BookingController::class, 'show']);
    Route::patch('/bookings/{id}', [BookingController::class, 'update']);
    Route::patch('/bookings/{id}/cancel', [BookingController::class, 'cancel']);
    Route::patch('/bookings/{id}/submit', [BookingController::class, 'submit']);
    Route::patch('/bookings/{id}/reschedule', [BookingController::class, 'reschedule']);
    // Parishioner's own certificate, rendered from the register entry of a completed booking.
    Route::get('/bookings/{id}/certificate', [BookingController::class, 'downloadCertificate']);
    // A wedding's later documents (license, Pre-Cana, banns, confession), added after submitting; the file is uploaded first.
    Route::put('/bookings/{id}/documents/{key}', [BookingController::class, 'attachDocument'])->where('key', '[A-Za-z]+');
    Route::get('/register-entries', [RegisterEntryController::class, 'index']);
    Route::get('/register-entries/{id}/certificate', [RegisterEntryController::class, 'certificate']);
    // Ownership-gated inside the controller (uploader, or staff/admin).
    Route::get('/documents/{userId}/{filename}', [DocumentController::class, 'show'])
        ->where(['userId' => '[0-9a-fA-F-]{36}', 'filename' => '[A-Za-z0-9._-]+']);

    Route::get('/notification-preferences', [NotificationController::class, 'getPreferences']);
    Route::patch('/notification-preferences', [NotificationController::class, 'updatePreferences']);
    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::post('/notifications/mark-all-read', [NotificationController::class, 'markAllRead']);
    Route::post('/notifications/{id}/read', [NotificationController::class, 'markRead']);

    // Tighter limit specifically for the two disk-writing upload endpoints —
    // this was the sharpest instance of the missing-rate-limit gap: unlimited
    // 5MB-per-call uploads to a free-tier host with no disk quota.
    // (The old POST /bookings/{id}/receipt manual-GCash-screenshot upload was
    // removed — payment is now verified by PayMongo's signed webhook below.)
    // Its own counter key: without one it shares the group's per-user counter, so every
    // upload counted twice and any other request in the minute ate into the 20.
    Route::middleware('throttle:40,1,document-upload')->group(function () {
        Route::post('/documents', [DocumentController::class, 'store']);
        Route::post('/wallet', [WalletController::class, 'store'])->middleware('role:parishioner');
    });

    // The document wallet is the parishioner's own: staff accounts have no use for it and are refused.
    Route::middleware('role:parishioner')->group(function () {
        Route::get('/wallet', [WalletController::class, 'index']);
        Route::delete('/wallet/{id}', [WalletController::class, 'destroy']);

        // Requests for a copy of a past record. Its own counter: the group's 60 a minute is not the limit that matters.
        Route::get('/certificate-requests', [CertificateRequestController::class, 'index']);
        Route::get('/certificate-requests/{id}', [CertificateRequestController::class, 'show']);
        Route::post('/certificate-requests', [CertificateRequestController::class, 'store'])->middleware('throttle:10,1,certificate-request');
        Route::post('/certificate-requests/{id}/cancel', [CertificateRequestController::class, 'cancel']);
    });

    // Creates (or resumes) a PayMongo GCash checkout session and returns its
    // URL. Tighter throttle: every call can hit PayMongo's API.
    // Its own counter key: without one it shares the group's per-user counter and is counted twice.
    Route::middleware('throttle:10,1,parishioner-payment')->group(function () {
        Route::post('/bookings/{id}/payment', [PaymentController::class, 'initiate']);
        Route::post('/bookings/{id}/payment/qr', [PaymentController::class, 'qr']);
    });
    // Demo only (PAYMENT_MODE=simulated; 404 otherwise): the mock GCash screen's code and confirm calls.
    Route::middleware('throttle:10,1,simulated-payment')->group(function () {
        Route::post('/bookings/{id}/payment/simulated/code', [SimulatedPaymentController::class, 'send']);
        Route::post('/bookings/{id}/payment/simulated/confirm', [SimulatedPaymentController::class, 'confirm']);
    });
    // Pay at the parish office instead: no PayMongo call, so the group's own limit is enough.
    Route::post('/bookings/{id}/payment/cash', [PaymentController::class, 'chooseCash']);
});

Route::middleware(['auth:sanctum', 'active', 'role:staff,admin', 'throttle:60,1'])->prefix('admin')->group(function () {
    Route::get('/schedule', [\App\Http\Controllers\Api\Admin\ScheduleController::class, 'index']);
    Route::get('/bookings', [AdminBookingController::class, 'index']);
    // Declared before /bookings/{id} so "counts" isn't captured as an id.
    Route::get('/bookings/counts', [AdminBookingController::class, 'counts']);
    // Same reason: the desk looks a booking up by the reference on a pass or typed from a phone call.
    Route::get('/bookings/by-reference/{reference}', [AdminBookingController::class, 'byReference']);
    Route::get('/bookings/{id}', [AdminBookingController::class, 'show']);
    // A wedding has sixteen documents, so staff go through them quickly: their own counter, and outside the group's 60 a minute.
    Route::put('/bookings/{id}/documents/{key}', [\App\Http\Controllers\Api\Admin\BookingDocumentController::class, 'review'])->where('key', '[A-Za-z]+')
        ->middleware('throttle:120,1,staff-document-review')->withoutMiddleware('throttle:60,1');
    // The same later documents, attached at the desk for a walk-in.
    Route::post('/bookings/{id}/documents/{key}/attach', [\App\Http\Controllers\Api\Admin\BookingDocumentController::class, 'attach'])->where('key', '[A-Za-z]+');
    // A wedding's preparation steps the office ticks by hand.
    Route::put('/bookings/{id}/milestones/{key}', [\App\Http\Controllers\Api\Admin\BookingMilestoneController::class, 'update'])->where('key', '[A-Za-z_]+');
    Route::get('/bookings/{id}/notes', [\App\Http\Controllers\Api\Admin\BookingNoteController::class, 'index']);
    Route::post('/bookings/{id}/notes', [\App\Http\Controllers\Api\Admin\BookingNoteController::class, 'store']);
    Route::get('/bookings/{id}/history', [AdminBookingController::class, 'history']);
    Route::patch('/bookings/{id}/approve', [AdminBookingController::class, 'approve']);
    Route::patch('/bookings/{id}/decline', [AdminBookingController::class, 'decline']);
    Route::patch('/bookings/{id}/return', [AdminBookingController::class, 'returnForChanges']);
    Route::patch('/bookings/{id}/cancel', [AdminBookingController::class, 'cancel']);
    Route::patch('/bookings/{id}/complete', [AdminBookingController::class, 'complete']);
    // Arrival on the appointment day; does not change the status.
    Route::post('/bookings/{id}/check-in', [AdminBookingController::class, 'checkIn']);
    Route::patch('/bookings/{id}/reschedule', [AdminBookingController::class, 'reschedule']);
    Route::patch('/bookings/{id}/partial-refund', [AdminBookingController::class, 'partialRefund']);
    Route::patch('/bookings/{id}/refund', [AdminBookingController::class, 'refund']);
    // Cash taken at the counter for a booking whose owner chose to pay at the parish office.
    Route::patch('/bookings/{id}/cash-received', [AdminBookingController::class, 'cashReceived']);
    // GCash link for an unpaid booking. Every call can hit PayMongo's API, so
    // a tighter limit; its own prefix keeps it from sharing (and double
    // counting against) the group's 60/minute counter.
    Route::middleware('throttle:10,1,staff-payment')->post('/bookings/{id}/payment', [AdminBookingController::class, 'paymentLink']);
    Route::get('/bookings/{id}/certificate', [AdminBookingController::class, 'downloadCertificate']);

    // The parish register. Reading, transcribing and filling in the paper reference are for the office;
    // correcting, revoking and reinstating are in the admin-only group below.
    Route::get('/register', [RegisterController::class, 'index']);
    Route::post('/register', [RegisterController::class, 'store']);
    Route::get('/register/next-numbers', [RegisterController::class, 'nextNumbers']);
    Route::get('/register/{id}', [RegisterController::class, 'show']);
    Route::get('/register/{id}/certificate', [RegisterController::class, 'certificate']);
    Route::patch('/register/{id}/paper-reference', [RegisterController::class, 'paperReference']);

    // Requests for a copy of a past record: find it in the register (or add it), then issue or decline.
    Route::get('/certificate-requests', [AdminCertificateRequestController::class, 'index']);
    Route::get('/certificate-requests/{id}', [AdminCertificateRequestController::class, 'show']);
    Route::post('/certificate-requests/{id}/issue', [AdminCertificateRequestController::class, 'issue']);
    Route::post('/certificate-requests/{id}/decline', [AdminCertificateRequestController::class, 'decline']);

    // Walk-ins (spec §6): bookings the office enters for someone at the counter.
    Route::get('/walk-ins/fields/{sacrament}', [WalkInController::class, 'fields']);
    Route::post('/walk-ins', [WalkInController::class, 'store']);
    Route::patch('/walk-ins/{id}', [WalkInController::class, 'update']);
    Route::patch('/walk-ins/{id}/submit', [WalkInController::class, 'submit']);
    // An exact-email lookup is still an account oracle: rate-limited on its own counter (RA 10173).
    Route::middleware('throttle:30,1,parishioner-lookup')->get('/parishioners/lookup', [WalkInController::class, 'lookup']);

    Route::get('/settings', [SettingsController::class, 'show']);
    Route::get('/blackouts', [BlackoutDateController::class, 'index']);
    Route::post('/blackouts', [BlackoutDateController::class, 'store']);
    Route::delete('/blackouts/{id}', [BlackoutDateController::class, 'destroy']);

    Route::get('/audit-log', [AuditLogController::class, 'index']);
    Route::get('/audit-log/summary', [AuditLogController::class, 'summary']);

    Route::get('/analytics', [AnalyticsController::class, 'index']);
    Route::get('/reports/summary', [ReportController::class, 'summary']);
    Route::get('/reports/bookings.csv', [ReportController::class, 'csv']);
    Route::get('/reports/bookings.xlsx', [ReportController::class, 'xlsx']);

    // Staff/admin management of parish announcements — previously the only
    // way this table ever got data was ParishEventSeeder. Same privilege
    // level as the bookings routes above (role:staff,admin), not the
    // admin-only user-management group below: posting an announcement isn't
    // a security-sensitive action. Does not touch the public
    // GET /api/events/upcoming route (ParishEventController, non-admin).
    Route::get('/parish-events', [AdminParishEventController::class, 'index']);
    Route::post('/parish-events', [AdminParishEventController::class, 'store']);
    Route::patch('/parish-events/{id}', [AdminParishEventController::class, 'update']);
    Route::delete('/parish-events/{id}', [AdminParishEventController::class, 'destroy']);
});

// User management (item 21) is scoped to 'role:admin' only, not
// 'role:staff,admin' like the group above — staff creating other
// staff/admin accounts, or changing roles, is a real privilege-escalation
// question this app doesn't need to take on. See Admin\UserController's
// class doc for the full reasoning.
Route::middleware(['auth:sanctum', 'active', 'role:admin', 'throttle:60,1'])->prefix('admin')->group(function () {
    Route::get('/users', [AdminUserController::class, 'index']);
    Route::post('/users', [AdminUserController::class, 'store']);
    Route::patch('/users/{id}/role', [AdminUserController::class, 'changeRole']);
    Route::patch('/users/{id}/deactivate', [AdminUserController::class, 'deactivate']);
    Route::patch('/users/{id}/activate', [AdminUserController::class, 'activate']);

    // Rules that apply to everyone are the admin's to change; staff can read them (GET /admin/settings).
    Route::patch('/settings/parish', [SettingsController::class, 'updateParish']);
    Route::patch('/settings/services/{id}', [SettingsController::class, 'updateService']);

    // A certificate that is wrong, or was issued in error, is the admin's call; staff can only fill in the paper reference.
    Route::patch('/register/{id}', [RegisterController::class, 'correct']);
    Route::post('/register/{id}/revoke', [RegisterController::class, 'revoke']);
    Route::post('/register/{id}/reinstate', [RegisterController::class, 'reinstate']);
});
