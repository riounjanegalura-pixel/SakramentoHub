# SakramentoHub API Contract (sketch)

Written before the mock layer so mocks are built against a contract, not
invented ad hoc. This is what the future Laravel backend spec implements.
Shapes here are the source of truth for `parishioner/src/lib/mock/types.ts`.

## Auth
- `POST /api/login` — `{ email, password }` → `{ user: User, token: string }`
- Client sends the token back as `Authorization: Bearer <token>` on every subsequent request.
- The `user` returned by `/login`, `/register` and `GET /me` carries `role` (see `User` under Shapes). The parishioner app reads it: a `staff` or `admin` account signing in there lands on the office desk (`/desk`) instead of `/home`.
- `POST /api/register` — `{ fullName, email, phone, password }` → `{ user: User, token: string }`
- Client sends the token back as `Authorization: Bearer <token>` on every subsequent request.
- `POST /api/logout` — → `204`
- `POST /api/forgot-password` — `{ email }` → `200 { message }`, always the same generic
  success message whether or not the email belongs to an account (no user-enumeration
  leak). Rate-limited with register/login (`throttle:10,1`). Writes a
  `password_reset_tokens` row and dispatches `App\Notifications\ResetPasswordNotification`
  — since `MAIL_MAILER=log`, that "email" is written to `storage/logs/laravel.log`, not
  actually sent; that's the intended zero-cost demo path. The link inside points at
  `{PARISHIONER_APP_URL}/reset-password?token=&email=` for a parishioner account, or
  `{ADMIN_APP_URL}/reset-password?token=&email=` for staff/admin.
- `POST /api/reset-password` — `{ token, email, password, passwordConfirmation }` →
  `200 { message }` on success (old password stops working, new one works, token
  consumed so it can't be reused) or `422 { message, errors: { token: [...] } }` for an
  invalid/expired/already-used token.
- `POST /api/email/verify` — `{ email, token }` → `200 { message }` on success (marks
  `emailVerifiedAt`, consumes the token) or `422` for an invalid/expired token.
  Rate-limited with register/login.

## Users
- `GET /api/me` → `User` (now includes `emailVerifiedAt: string | null`).
- `PATCH /api/me` — `Partial<User>` → `User`
- `PATCH /api/me/password` — `{ currentPassword, newPassword }` → `204`
- `POST /api/email/verification-notification` (authenticated) — resends the verification
  email for the logged-in user; `200 { message }` whether it actually sent one or the
  account was already verified. Rate-limited tighter than the general authenticated
  group (`throttle:6,1`).
- `POST /api/email/verify-code` (authenticated, 8/min) — `{ code }` (6 digits from the verification email) → `200 { message }` and the account is verified; `422` on a wrong or expired code. Same 60-minute life and single use as the link. The app shows a code box on its Check your email screen because the emailed link goes through the mail service's click tracker, which some browsers block.
- `GET /api/me/export` (authenticated) — item 11's RA 10173 self-service data-access
  right. Returns `200` with a JSON body (`Content-Disposition: attachment;
  filename="sakramentohub-my-data.json"` so the browser downloads it, not just displays
  it) containing the requesting user's own profile fields, all of their bookings
  (including `formData`), notifications, and notification preferences — scoped strictly
  to `$request->user()`, never any other user's data, and never internal-only fields
  (password hash, Sanctum tokens). It also carries three blocks: `wallet` (metadata only:
  `[{ id, kind, personName, originalName, mime, sizeBytes, createdAt }]`, no file bytes and
  no file address), `certificateRequests` (the parishioner `CertificateRequest` shape) and
  `registerEntries` (`[{ registerNumber, register, ceremonyDate, status }]`: the entries of
  the person's own bookings and those issued to them on a request).
- `DELETE /api/me` — `{ currentPassword }` → `204`, or `422` if the password is wrong.
  Item 11's RA 10173 self-service deletion right. Re-checks the current password first
  (same pattern as `PATCH /api/me/password`), then **hard-deletes** the `users` row —
  not a soft `isActive` flag, which already means something else (admin-initiated
  suspension, see `PATCH /api/admin/users/:id/deactivate`). Before deleting: every
  Sanctum token is revoked (the old token 401s immediately after), and each of the
  user's bookings gets a `fullName`/`email` snapshot written into a new denormalized
  field so booking history stays displayable to admin/staff — booking rows themselves
  are NOT deleted (`bookings.user_id` is `nullOnDelete`, matching the audit log's own
  `actor_user_id` pattern), preserving the parish's own sacramental recordkeeping.
  Notifications and notification preferences DO cascade-delete — they're the user's own
  inbox/settings with no independent recordkeeping value. The email becomes available
  for a new registration immediately, since the row is genuinely gone.
  In the same transaction: the user's `wallet_documents` rows are deleted; every
  certificate request gets an `ownerSnapshot` (`fullName`, `email`, `accountDeleted: true`);
  `submitted` requests are also set to `cancelled` with `closedAt`, their ID and letter
  addresses become `null` and `filesRemovedAt` is set (closed requests keep their status and
  follow the 30-day file clean-up). After the commit, each wallet file and each cancelled
  request's ID/letter file is deleted by `StoredDocuments::deleteIfUnreferenced`, so a file
  a booking or document review still uses stays. Register entries and booking files are
  untouched except as follows: the user's `draft` bookings (not parish records; a walk-in draft the office started is left to its own clean-up) are deleted in the same transaction, and after the commit
  every file in the user's `documents/{userId}/` folder goes through the same check, so never-attached uploads and replaced late files are removed while a file a surviving booking, review
  or request still uses stays. Each deletion is logged on failure and never undoes the account deletion.

## Email verification gate
A parishioner with `emailVerifiedAt: null` can still log in, browse Services, and view
their own booking history/detail — but `PATCH /api/bookings/:id/submit` (the actual
"submit this booking" action, not the draft-saving `POST /api/bookings`) 403s with a
specific message until they verify. Staff/admin accounts are provisioned directly (never
self-register) and are treated as pre-verified/trusted — the gate does not apply to them.

## Services
- `GET /api/services` → `Service[]`
- `GET /api/services/:id` → `Service`
- `GET /api/services/:id/requirements` (public) → `{ serviceId, documents: [{ key, label, walletKind, requirement: 'required'|'conditional'|'optional', condition: string|null }] }`. Every document the service can ask for, from the same list submit validation reads (`SacramentDocuments::catalogue`); `condition` is plain words for conditional ones ("Required unless the parents are not married"), `null` otherwise. `walletKind` is one of `birth_certificate, baptismal_certificate, confirmation_certificate, marriage_contract, cenomar, death_certificate, other`. Anointing and house blessing return `documents: []`. Unknown service `404`.
- `GET /api/parish` → `{ name, phone, address, priestName, workingHours: { start, end } }` (public). `address` is where cash is paid at the parish office.

- `POST /api/verify` (public, no token; `throttle:20,1,certificate-verify`, so the 21st request in a minute is `429`) — body `{ number, code }` (`number` string <= 20, `code` string <= 30; `422` keyed to the field otherwise). The number is trimmed and upper-cased, the code is stripped of everything but letters and digits and upper-cased, so `bap-2026-0007` and `abcd efgh jkmn` resolve. `200 { status: 'valid'|'revoked', parishName, sacrament: 'Baptism', registerNumber, subjectName, ceremonyDate: 'Y-m-d', minister, correctedOn: 'Y-m-d'|null }` — exactly those keys, read from the frozen snapshot (a corrected entry shows the corrected name). Any miss — unknown number, wrong code, or an entry with no code (anointing) — is the identical `404 { message: 'No record found. Check the number and code on the certificate.' }`. `Cache-Control: no-store`.

`Service` now carries its scheduling rules: `feeRule, durationMinutes, offsite, allowedWeekdays,
leadTimeDays, dailyCapacity, sessionWeekdays, sessionTimes, sessionCapacity`. Availability
endpoints are listed under Bookings.

## Bookings
Appointment fields live on the booking, not in `formData`. Field keys inside
`formData` follow the Field Dictionary in `docs/data-dictionary.md`.
- `POST /api/bookings` — `{ sacrament, formData, appointmentDate?: 'Y-m-d', appointmentStart?: 'H:i' }` → `Booking` (draft upsert; one draft per user + sacrament). Shape-only validation; `appointmentDate` must not be before parish-today (Asia/Manila).
- `PATCH /api/bookings/:id` — `{ formData?, appointmentDate?, appointmentStart? }` → `Booking`. Only while `draft` or `returned` (422 otherwise). An absent key leaves that field unchanged; an explicit `null` for `appointmentDate`/`appointmentStart` clears it. `appointmentEnd` is recomputed from the stored date, start and answers on every PATCH, and is `null` whenever the date or the start is missing.
- `GET /api/bookings` → `Booking[]` (own bookings only, newest first, not paginated). A walk-in the office is still drafting (`channel: 'walk_in'`, `status: 'draft'`) is **hidden** from its linked parishioner (`Booking::visibleToOwner`): it is absent from the list, `GET /api/bookings/:id` answers 404, and `PATCH /api/bookings/:id`, `/submit` and the rest cannot reach it. It appears once staff submit it. `POST /api/bookings` only ever resumes the user's own `online` draft.
- `GET /api/bookings/:id` → `Booking`.
- `PATCH /api/bookings/:id/submit` (no body) → `Booking`. 403 until the email is verified. Runs full per-sacrament validation (`App\Validation\SacramentRules`; errors keyed `formData.<field>`) and the scheduling check (`App\Services\Scheduling\SchedulingService`: parish-day, lead time, allowed weekdays, blackouts incl. Easter Triduum, working hours, capacity, one-priest overlap with travel buffers, Masses and the Sunday baptism session). Lead time and the same-day "an hour from now" cutoff are booking-time rules: a `returned` booking resubmitted with the date and start it held when it was returned is not re-checked against them (every other rule still is, and a start already in the past is refused); a changed date or start gets the full check. Staff approval re-checks the held slot the same way. Sets `paymentStatus` `unpaid` (48 h hold) when a fee applies, else `not_required`; a `paid` payment status is kept on resubmit. Resubmitting while `paymentStatus` is `refund_due` is refused (422: the office is processing a refund), as is a resubmit that raises the fee of an already-paid booking. Emergency anointing (`inDangerOfDeath`) skips scheduling and alerts staff. It needs a number the priest can call: the contact phone (account or walk-in contact) and `formData.alternatePhone`, spaces and dashes ignored and `+639XXXXXXXXX` read as `09XXXXXXXXX`, are checked against `^09\d{9}$`; with none, submit answers `422 { message, errors }` keyed `formData.alternatePhone`: `Add a mobile number we can call right now (09XXXXXXXXX). The priest needs it to reach you.` before anything changes. The staff alert reads `Patient in danger of death — {reference}. Contact the family right away: {numbers joined with ' or '}.`
- `PATCH /api/bookings/:id/cancel` — `{ reason }` → `Booking`. An approved booking can be cancelled online only until 3 days before the appointment (422 with the parish phone after that). Unpaid → `void` (checkout expired); paid → `refund_due`.
- `PATCH /api/bookings/:id/reschedule` — `{ appointmentDate, appointmentStart }` → `Booking`. From `submitted`/`approved` only; an **approved** booking can be rescheduled online only until 3 parish (Manila) days before its current appointment — later it answers 422 with a message naming the parish phone ("…Please call the parish office at <parishPhone>."), the same rule and constant as cancelling. A `submitted` booking is unaffected by the cut-off. A rescheduled approved booking returns to `submitted` with staff notified. Rescheduling an emergency anointing to a real date clears `isEmergency`.
- **Payment hold rule** (wherever this contract says "48 h hold"): `hold = min(now + 48 h, max(appointment start, now + 1 h))`, set at submit and when a refund reopens payment; a reschedule never lengthens an open hold and shortens it to the new cap. The expiry reason is `Payment not completed by Nov 3, 10:00 AM.` (parish time); the refund notification says `Please pay again by …`. A **returned** booking's hold also ends at its appointment start: `bookings:expire-holds` cancels it with `Not resubmitted before the appointment time.` (the 7-day lapse keeps `Not resubmitted within 7 days.`). A `pending_cash` booking holds its slot on the same deadline as `unpaid` (choosing cash never lengthens it) and is cancelled by `bookings:expire-holds` with the same reason; its payment-closing reminder says `Bring the cash to the parish office before then to keep your slot.`
- `POST /api/bookings/:id/payment` → `{ checkoutUrl, checkoutSessionId }`. Payable only while `submitted`/`returned`, `unpaid` or `pending_cash` (a parishioner who chose cash may still switch to GCash), and (returned, or within the 48 h hold). 409 if paid, 422 otherwise (a `submitted` booking whose 48 h hold has lapsed answers that the payment window has closed), 503 if PayMongo isn't configured, 502 on PayMongo errors. Throttled `throttle:10,1,parishioner-payment`: the third argument is its own counter key, so it no longer shares (and is counted twice against) the authenticated group's per-user `throttle:60,1` counter.
- `POST /api/bookings/:id/payment/cash` → `Booking`. The owner will pay cash at the parish office: only a `submitted` booking that is `unpaid` with a live hold (`422` otherwise: already paid, no payment due, not submitted, or the payment window has closed; `404` for someone else's booking). Sets `paymentStatus: 'pending_cash'`, `paymentMethod: 'cash'`, keeps `paymentHoldExpiresAt` unchanged; audit `booking.cash_chosen` `{ from, holdExpiresAt }`. Choosing again while `pending_cash` returns the booking unchanged with no new audit row. A `pending_cash` booking returned for changes stays `pending_cash` when resubmitted (with a fresh hold). In the authenticated group's `throttle:60,1` (no PayMongo call).
- `PUT /api/bookings/:id/documents/:key` — `{ fileUrl }` → `Booking`. **Late upload** for a wedding: adds or replaces one of
  `marriageLicense`, `preCanaCertificate`, `bannsCertificate`, `confessionCertificate` while the booking is `submitted` or
  `approved`, without changing its status (an approved wedding stays approved). Upload the file first (`POST /api/documents`)
  and send its `url` as `fileUrl`; it must be a file in the caller's **own** folder that exists (`422` on `errors.fileUrl`
  otherwise, also for a walk-in linked to the caller: the office's files go through the admin attach route). Own bookings
  only (404). `422 { message }`: `Documents can be added later only to a wedding booking.`;
  `Only the marriage license, Pre-Cana, banns and confession documents can be added after the booking is submitted.`;
  `Documents can be added only while the booking is submitted or approved.` Writes `formData[key]` under the booking lock,
  audits `document.attached_late` (`{ documentKey, label, replaced: boolean }`) and alerts staff (`Document added` —
  "{reference}: {label} was uploaded and needs review."). The document then shows in `documents` with `review: null`;
  replacing a file that was already accepted makes it unreviewed again, and reopens the step it had completed. A
  later document never gates approval (staff approve and payment auto-approval skip these four keys, whether unreviewed or rejected); an unreviewed core document still does, and the wedding's completion steps are unchanged. In the group's `throttle:60,1`.
- `GET /api/bookings/:id/certificate` → the certificate as `text/html` (`Cache-Control: no-store`), rendered from the booking's register entry; `404 { message: 'No certificate yet.' }` when the booking is not completed. Own bookings only.
- `GET /api/register-entries/:id/certificate` → the same HTML by register-entry id. Allowed when the entry's booking is the caller's own (`visibleToOwner`), **or** when the entry fulfils an `issued` certificate request of the caller (the HTML then prints `Issued for: {purpose}` with that request's purpose; an entry reachable both ways opens as the booking one, without the line); `404` otherwise, including a transcribed entry the caller has no issued request for.

**Validation errors (422).** Laravel's shape: `{ message: string, errors: { "<key>": string[] } }`. Keys that can appear on a booking write or submit: `formData.<field>` (nested paths such as `formData.godparents.0.fullName`), `appointmentDate`, `appointmentStart`, and on the walk-in endpoints also `contact.<field>`, `linkUserId`, `waiveReason`. The parishioner wizard maps each key to the step that owns the field (`formData.*` by the field's root, `appointment*` to the schedule step, `contact.*`/`linkUserId` to the desk's Walk-in contact step), opens the earliest failing step and shows the messages. A business-rule refusal (scheduling conflict, cut-off, refund in progress, wrong state) is `422 { message }` with no `errors` object; the message is shown as is.

**Booking statuses:** `draft`, `submitted`, `returned`, `approved`, `completed`, `declined`, `cancelled`. **Payment statuses:** `not_required`, `unpaid`, `pending_cash` (label `Cash at the parish office`), `paid`, `refund_due`, `refunded`, `void`. `pending_cash` moves only to `paid` (cash recorded by the office, or a GCash payment confirmed by the webhook) or `void` (closed or expired); nothing moves back to `pending_cash` from `paid`. Staff may also record cash straight from `unpaid` (a walk-in paying at the counter). A payment arriving for a closed booking, or short of the amount due, becomes `refund_due` — never `paid`, never dropped.

**`Booking` shape:** `id, referenceNumber, userId, sacrament, status, statusLabel, formData, appointmentDate, appointmentStart, appointmentEnd, isEmergency, paymentStatus, amountDueCentavos, paymentHoldExpiresAt, paidAt, paymentReference, paymentMethod, cashReceiptReference, refundReference, refundedAt, statusReason, returnNote, channel, amountPaidCentavos, amountRefundedCentavos, overpaidCentavos, documents, registerEntry, checkedInAt, dayPass, createdAt` (see "Shapes"). `userId` is `null` for a walk-in with no linked account. `registerEntry` is `null` until the booking is completed, then `{ id, registerNumber: 'BAP-2026-0007', status: 'valid'|'revoked', enteredAt: ISO-8601 }` (also on `AdminBooking`). `checkedInAt` is the ISO time the office checked the party in on the appointment day, else `null`. `dayPass` is `null` unless the booking is `approved` and has an appointment; then `{ url: '{ADMIN_APP_URL}/check-in/{referenceNumber}', qrSvg: '<svg …>' }`. **`qrSvg` is drawn only on single-booking responses** (`GET /api/bookings/:id`, the booking returned by store, update, submit, cancel and reschedule, and the admin single-booking responses); in a list (`GET /api/bookings`, `GET /api/admin/bookings`) `dayPass` is `{ url }` alone.

**Availability (public):**
- `GET /api/services/:sacrament/availability?date=Y-m-d[&scheduleType=regular|special][&massType=church|house]` → `{ date, status: free|limited|full|unavailable, reason, freeStarts: string[] }`
- `GET /api/services/:sacrament/availability-range?start&end[&scheduleType][&massType]` → `{ sacrament, days: [{ date, status, reason, freeCount }] }` (max 62 days).
- Both accept an optional `waiveLeadTime=1` (the backend's `boolean` rule takes `1`/`0` in a query string; the literal `true` answers 422). It is honored **only** for a signed-in active staff/admin bearer token (the office may waive lead time and the same-day cutoff for a walk-in; conflicts, blackouts and working hours still apply); for a guest or a parishioner the flag is silently ignored.
- Both accept an optional `excludeBookingId=<booking id>`. For a staff/admin caller it may name **any** booking (the office edits and moves anyone's); for a parishioner it must be their own. When the request carries the owner's bearer token, that booking does not block its own slot — the wizard sends it for the returned booking being edited (or the saved draft), because a returned booking still holds its slot. For a `returned` booking, the start it held when staff returned it stays in `freeStarts` on that date even once lead time or the same-day cutoff has passed. The id is **ignored** (no error, ordinary public answer) for a guest, for a booking that is not a parishioner caller's own, or for an unknown id.

## Payments webhook (PayMongo → this API; no user token)
- `POST /api/donations` (`throttle:10,1,donation`, public; a valid token links the gift to the account). Body
  `{ amountCentavos }`, 2000 (PHP 20) to 10,000,000. Opens a GCash-only PayMongo checkout and returns
  `201 { checkoutUrl }`; the success and cancel URLs are `/donate/thanks` and `/donate/cancelled` on the parishioner
  app. `422` for a bad amount, `503` with no PayMongo key, `502` if PayMongo fails (nothing is kept). The same
  `/webhooks/paymongo` marks the `donations` row `paid` (found by `metadata.donation_id`); the redirect proves nothing.
- `POST /api/webhooks/paymongo` (`throttle:120,1`, outside `auth:sanctum`). Register it in
  PayMongo for the `checkout_session.payment.paid` event; its returned `secret_key` goes in
  `PAYMONGO_WEBHOOK_SECRET`.
  - **Auth:** the `Paymongo-Signature: t=<ts>,te=<test sig>,li=<live sig>` header must
    match `HMAC-SHA256("<t>.<raw body>", PAYMONGO_WEBHOOK_SECRET)` — `te` when
    `PAYMONGO_MODE=test`, `li` when `live` — compared in constant time, with `t` within
    `PAYMONGO_WEBHOOK_TOLERANCE` seconds. `401` otherwise; `503` (fail closed) if no
    secret is configured. Events whose `livemode` disagrees with `PAYMONGO_MODE` are ignored.
  - **Effect:** finds the booking by `metadata.booking_id`, checks the paid amount covers
    `amountDueCentavos`, then sets `paymentStatus: 'paid'`, `paidAt`, the PayMongo
    payment id, writes a `booking.payment_confirmed` audit row (no human actor), and
    notifies the parishioner. Status stays `submitted` for staff review unless
    `PAYMONGO_AUTO_APPROVE_ON_PAYMENT=true`, which also moves it to `approved`.
  - **Return URLs** (set when the checkout is created): a booking with `channel: 'online'` returns the payer to
    `{PARISHIONER_APP_URL}/payment/success?bookingId=…` or `/payment/cancelled?bookingId=…` (signed-in pages); a
    `walk_in` booking — linked to an account or not — returns to the public `{PARISHIONER_APP_URL}/payment/received`
    or `/payment/received?cancelled=1`, which need no login (the payer is at the counter on their own phone).
  - **Idempotent:** always `200 { received, result, detail }` for authentic events —
    `result` is `processed`, `duplicate` (already paid; no second notification), or
    `ignored` (unknown booking, nothing due, short amount, other event type) — so
    PayMongo's retries never double-apply and never loop on an unfixable event.
- Certificates are no longer stored files: see `GET /api/bookings/:id/certificate` under Bookings. A parishioner reaches their own without a parish-office visit.

## Documents
- `POST /api/documents` (`throttle:40,1,document-upload`, shared with `POST /api/wallet`; the 41st upload in a minute is `429`) — multipart file upload → `{ url: string }`. Backs the sacrament
  wizards' prerequisite-document fields (baptismal certificate, marriage license, etc).
  Deliberately not booking-scoped: a wizard's draft booking doesn't exist server-side
  until the final review step, so a document may be uploaded before any booking id
  exists. The caller writes the returned `url` into the relevant `formData` field itself
  when it later calls `POST /api/bookings` or updates the draft. Stored on the **private**
  disk under the uploader's own user id; `url` is an authenticated download path
  (`/api/documents/:userId/:filename`) that needs the bearer token — not a plain
  `<img>`/`<a>` target.
- `GET /api/documents/:userId/:filename` → the raw document file. Ownership-gated: the
  uploader, staff/admin, or the linked owner of a **visible walk-in** (not a draft) whose `form_data` references the file **and** whose uploader is an active staff/admin account, so a walk-in's linked parishioner can open what staff uploaded for it (pasting another parishioner's file URL into one's own booking unlocks nothing) — 403 otherwise. An upload nobody attached stays private to its uploader. Staff upload on a walk-in's behalf with the same `POST /api/documents` (stored under the staff member's own id) and write the URL into the draft's `formData`.

### Document wallet (parishioner role only; staff/admin `403`)
A parishioner's own store of documents to reuse across bookings. `WalletDocument` = `{ id, kind, personName, fileUrl, originalName, mime, sizeBytes, createdAt }`. `kind` is one of `birth_certificate, baptismal_certificate, confirmation_certificate, marriage_contract, cenomar, death_certificate, other`.
- `GET /api/wallet` → `WalletDocument[]`, mine only, newest first.
- `POST /api/wallet` (shares the `document-upload` throttle counter with `POST /api/documents`) — multipart with `file` (jpg/jpeg/png/pdf, 5 MB, stored in the caller's own folder like `POST /api/documents`) **or** JSON/form `fileUrl` (an existing upload in the caller's own folder: another user's or a made-up address is `422` on `fileUrl`), plus `kind` (one of the eight) and `personName` (required, <= 120). `201 WalletDocument`. The same `fileUrl` already in the caller's wallet returns the existing row with `200` unchanged. The 31st document is `422 { message: 'Your wallet is full (30 documents). Delete one to add another.' }` (checked before an uploaded file is stored). For `fileUrl`, `originalName` is the stored file name.
- `DELETE /api/wallet/:id` → `204`. Another user's id is `404`. The row goes first, then the file is deleted only when no booking's `form_data` (any user, any status), no `booking_document_reviews` row and no other wallet row still uses the address (`App\Support\StoredDocuments::deleteIfUnreferenced`), so a submitted booking's file stays viewable to its owner and to staff.
- `GET /api/register-entries` → `[{ id, registerNumber, register: 'Baptism'|'Confirmation'|'Marriage'|'Death'|…, subjectName, ceremonyDate: 'Y-m-d', status: 'valid'|'revoked', verifyUrl: string|null, via: 'booking'|'request' }]` — the entries of the caller's own (visible) bookings (`via: 'booking'`) and those issued to them on a certificate request (`via: 'request'`), newest ceremony first; an entry reachable both ways is listed once, as `booking` (the certificates they may open via `GET /api/register-entries/:id/certificate`).

### Certificate copy requests (parishioner role only; staff/admin `403`)
A request for a copy of a past record in one of the four canonical registers. It holds no register data until staff issue it. `CertificateRequest` = `{ id, referenceNumber: 'CERT-YYYYMMDD-XXXX', sacrament: 'baptism'|'confirmation'|'wedding'|'funeral', personName, sacramentDateText, details: { fatherName: string|null, motherName: string|null, spouseName: string|null }, relationship: 'self'|'parent'|'child'|'spouse'|'sibling'|'representative', purpose, status: 'submitted'|'issued'|'declined'|'cancelled', declineReason: string|null, registerEntry: { id, registerNumber }|null, createdAt, closedAt: string|null }` (ISO 8601). `registerEntry` is set only once issued. The ID and letter addresses are never in this shape.
- `GET /api/certificate-requests` → `CertificateRequest[]`, mine only, newest first.
- `GET /api/certificate-requests/:id` → `CertificateRequest`; another user's id is `404`.
- `POST /api/certificate-requests` (`throttle:10,1,certificate-request`, its own counter) → `201 CertificateRequest`. Needs a verified email (`403 { message: 'Please verify your email address before requesting a certificate. …' }`). Body `{ sacrament (one of the four), registerNumber? (<=40, the number printed on the certificate), personName (<=160), sacramentDateText (<=60), details?: { fatherName?, motherName?, spouseName? } (each <=160), relationship (one of six), purpose (<=200, required), idUrl (required), letterUrl (required when relationship is representative) }`; `personName` and `sacramentDateText` are required unless `registerNumber` is sent; with it the server finds the valid register entry of that certificate (`422` on `registerNumber` when none matches), fills the name and the ceremony date from it and keeps the number in `details.registerNumber`. `idUrl` and `letterUrl` must be uploads in the caller's own folder that exist (`422` on the field, like the wallet). A sixth open (`submitted`) request is `422 { message: 'You already have 5 open requests.' }`. A parishioner who already holds that record through their own booking is not refused here. Staff and admins get an in-app alert, `New certificate request`, linking to the request; a failed alert is logged and does not fail the request.
- `POST /api/certificate-requests/:id/cancel` → `200 CertificateRequest` (`cancelled`). Only a `submitted` request: `422 { message: 'Only a request that is still waiting can be cancelled.' }`. Another user's id is `404`. Audited `certificate_request.cancelled`.
- The ID and letter files are deleted 30 days after the request closes (`certificate-requests:prune-files`, daily): the addresses become `null` on the admin shape and `filesRemovedAt` is set. A file still used by a booking, a wallet row or another request stays on disk.
- Files a staff or admin user uploaded (`POST /documents`) that no booking or certificate request references are deleted after 7 days (`documents:prune-staff-uploads`, daily), so a failed walk-in attach leaves nothing behind. A parishioner's uploads are never swept.

## Events
- `GET /api/events/upcoming` → `ParishEvent[]`

## Admin (staff/admin only — `role:staff,admin` gated, 403 for a `parishioner`)
All routes below require `Authorization: Bearer <token>` for a user whose `role` is
`staff` or `admin`; a `parishioner` token gets `403`.

- `GET /api/admin/bookings?status=&sacrament=&priority=&search=&perPage=&paymentStatus=&channel=&from=&to=&attention=` → paginated `AdminBooking[]`
  `status`, `sacrament`, `paymentStatus` and `channel` each take one value or a comma-separated list (`?status=submitted,approved&sacrament=baptism,wedding`), matched as "any of"; an unknown `status`, `paymentStatus` or `channel` value in the list answers 422 (the queue's multi-select filters). `GET /api/admin/bookings/counts` takes the same lists.
  (Laravel's default paginator envelope: `{ data: AdminBooking[], links, meta }`).
  Lists **every** user's bookings (not scoped to the caller), optionally filtered by
  `status` and/or `sacrament`. Without a `status` filter, `draft` bookings are left out
  (an unsubmitted draft is the parishioner's own work in progress) **unless `search` is
  given** (a draft's reference number read over the phone must be findable); `status=draft`
  lists them on request. Each row eager-loads the owning user's `fullName`/`email`.
  Default order is `createdAt` descending. Pass `priority=1` to switch `submitted`
  bookings (or whatever the `status`/`sacrament` filters match) into urgency order —
  see "Priority ordering rule" below. `search` (item 16) matches, case-insensitively and
  on a partial string, against the owning user's `fullName`/`email` OR the booking's own
  `referenceNumber` — combined as an AND with `status`/`sacrament`/`priority`, not a
  replacement for them. An empty/absent `search` returns everything; a `search` with no
  matches returns an empty (not erroring) paginated page. Search also matches the
  `owner_snapshot` name/email of a walk-in or of a deleted account.
  - `perPage` — integer 1–100, default 15.
  - `paymentStatus` — one of `PaymentStatus`. `channel` — `online` | `walk_in`.
  - `from` + `to` (`Y-m-d`, both required together, `to >= from`) — bookings whose
    appointment date falls in the range, or, for a booking with no appointment (an urgent
    anointing), whose request date (Manila) does. Drafts never match a range.
  - `attention=overpaid` — `paid` bookings where `amountPaidCentavos − amountRefundedCentavos − amountDueCentavos > 0`.
  - Invalid values answer `422` with `errors.<field>`.
- `GET /api/admin/bookings/counts?status=&search=` →
  `{ total: number, bySacrament: Record<Sacrament, number> }`. Per-sacrament counts for the
  Bookings Queue's category tabs, from one grouped query. Applies the same `status`, `search`,
  `paymentStatus`, `channel`, `from`/`to` and `attention` filters as the list above (so drafts are counted
  only with `status=draft`, or when searching); `sacrament`, `priority` and `perPage` are ignored. Every sacrament key is
  present, zero-filled.
- `GET /api/admin/bookings/:id` → `AdminBooking` (404 if not found)
- `PATCH /api/admin/bookings/:id/approve` → `AdminBooking`, moves `submitted` → `approved`.
  `422` if the booking is not currently `submitted`, if its `paymentStatus` is not `paid` or
  `not_required` (GCash is confirmed by the PayMongo webhook; cash is recorded by staff with `cash-received` first (from `unpaid` or `pending_cash`), and a
  `pending_cash` booking answers `This booking cannot be approved until the cash payment is received and recorded.`), or if any
  uploaded document is not `accepted` (`Review every uploaded document before approving.`; a booking
  with no uploaded documents passes). The held slot is re-checked without the lead-time rule. Writes an audit-log row
  (`action: 'booking.approved'`, `metadata: { from, to }`).
- `PATCH /api/admin/bookings/:id/decline` — `{ reason: string }` → `AdminBooking`, moves the
  booking to `declined` and stores `reason` as `statusReason`. `422` if the booking can't be
  declined from its current state, or if `reason` is missing. Writes an audit-log row
  (`action: 'booking.declined'`, `metadata: { from, reason }`).
- `PATCH /api/admin/bookings/:id/return` — `{ note?: string }` (max 1000) → `AdminBooking`, moves a
  `submitted` booking to `returned` so the parishioner can fix it, storing `note` as
  `returnNote` (audit `booking.returned`, metadata includes `rejectedDocuments`). The note is
  optional **when at least one document is `rejected`** (then `returnNote` defaults to "Please replace the
  documents marked as rejected."); with no note and no rejected document → `422`.
- `PATCH /api/admin/bookings/:id/cancel` — `{ reason: string }` → `AdminBooking`, moves the
  booking to `cancelled` (audit `booking.cancelled`). Unpaid → `void`; paid → `refund_due`.
- `PATCH /api/admin/bookings/:id/refund` — `{ reference: string (max 120), note?: string (max 500) }` →
  `AdminBooking`. `422` unless `paymentStatus` is `refund_due`. The amount owed is
  `amountPaidCentavos − amountRefundedCentavos` (falls back to `amountDueCentavos` for old rows). On a **closed**
  booking (cancelled/declined/completed…) it moves to `refunded`, adds the amount to `amountRefundedCentavos`, and
  records `refundReference`/`refundedAt`. On an **open** booking (`submitted`/`returned`) with a fee it
  instead returns `paymentStatus` to `unpaid` (a new 48 h hold when `submitted`) and clears `paymentMethod`, `cashReceiptReference` and the paid
  fields, so the parishioner can pay again. Audit `booking.refunded` metadata:
  `{ reference, note, amountCentavos, paymentId, reopenedForPayment }` — on reopen the booking's
  `amountPaidCentavos`/`amountRefundedCentavos` reset, so the refunded amount and the old PayMongo `paymentId` live in this audit row
  (the old id also stays on the booking until a new payment replaces it). A late replay of the refunded PayMongo payment id (matched against
  these audit rows) stays a `duplicate`: no alert, no audit.
- `PATCH /api/admin/bookings/:id/partial-refund` — `{ reference: string (max 120), amountCentavos: integer ≥ 1 }` →
  `AdminBooking`. Refunds part of an **overpayment**; adds to `amountRefundedCentavos` and keeps
  `paymentStatus: 'paid'` (audit `booking.partial_refund`). `422` if `overpaidCentavos` is 0 or the amount exceeds it.
- `PATCH /api/admin/bookings/:id/reschedule` — `{ appointmentDate: 'Y-m-d', appointmentStart: 'H:i', reason: string (max 500), waiveLeadTime?: boolean (JSON `true`/`false` or `1`/`0`) }` →
  `AdminBooking`. From `submitted`/`approved` only (422 otherwise). Full scheduling check; `waiveLeadTime`
  skips only the lead-time/same-day rule. Status is unchanged, `isEmergency` clears, the owner is notified
  (audit `booking.rescheduled_by_staff`: `fromDate, fromStart, date, start, reason, leadTimeWaived`). Works for a booking with no account.
- `PATCH /api/admin/bookings/:id/cash-received` (staff or admin) — `{ receiptReference?: string (max 120) }` → `AdminBooking`. Only while `paymentStatus` is `pending_cash` (the parishioner chose cash) or `unpaid` (a walk-in or anyone paying cash at the counter), the booking is `submitted`/`returned` and still holds its slot (else `422`: `Only a booking waiting for payment can be marked as cash received.` for any other payment status, so `paid` stays terminal; a lapsed hold answers `The hold on this booking has lapsed, so its time is no longer held. Do not take the cash: the parishioner needs to make a new booking.`). Sets `paid`, `paymentMethod: 'cash'`, `paidAt`, `amountPaidCentavos` = `amountDueCentavos`, clears the hold; audit `booking.cash_received` `{ amountCentavos, receiptReference, from: 'unpaid'|'pending_cash', fromUnpaid|fromPendingCash: true }`; notifies the owner (`Payment Received`, mailed). It does not approve. Refunding cash is out of scope: `refund_due` follow-up still assumes the PayMongo dashboard.
- `POST /api/admin/bookings/:id/payment` (`throttle:10,1,staff-payment`) → `{ checkoutUrl, checkoutSessionId }`. Also offered while `pending_cash`.
  The GCash link for an unpaid booking, for any owner (so a walk-in can pay at the counter).
  `409` if already `paid`; `422` if the 48 h hold has lapsed or nothing is due; `503` if PayMongo is not
  configured; `502` on PayMongo errors.
- `PUT /api/admin/bookings/:id/documents/:key` (`throttle:120,1,staff-document-review`: its own counter, outside the group's 60 a minute) — `{ status: 'accepted'|'rejected', note?: string (max 500) }`
  (`note` required when rejected) → `AdminBooking`. Only while the booking is `submitted` (422
  `Documents can only be reviewed while the booking is awaiting review.`), with one exception: a wedding's four later
  documents (`marriageLicense`, `preCanaCertificate`, `bannsCertificate`, `confessionCertificate`) can also be reviewed
  while it is `approved`. `key` must be an uploaded document of the booking's checklist (422
  `That document is not attached to this booking.`). The review is bound to the file URL: replacing the file
  resets `review` to `null`. Audit `document.accepted` / `document.rejected`. Rejecting a later document on a
  **submitted or approved** wedding leaves its status alone and notifies the owner (`Document needs replacing` — "{label}
  for your Wedding booking ({reference}) was not accepted: {note}. Please upload a new copy."); rejecting any other
  document on a `submitted` booking sends nothing by itself, as before (returning the booking does).
- `POST /api/admin/bookings/:id/documents/:key/attach` — `{ fileUrl }` → `AdminBooking`. The office's side of the late
  upload under Bookings (`PUT /api/bookings/:id/documents/:key`), for a **walk-in** only: an online booking answers
  `422 { message: "The office can add documents only to a walk-in booking. An online booking's owner uploads their own." }`.
  Same keys, statuses, messages, audit row and staff alert as the owner's route. `fileUrl` follows the walk-in rule used
  at submit: a file of the linked account, of the staff member who entered the booking, or of any active staff/admin
  account (`422` on `errors.fileUrl` otherwise). In the group's `throttle:60,1`.
- `GET /api/admin/bookings/:id/notes` → `BookingNote[]` (plain array, oldest first). `POST /api/admin/bookings/:id/notes` —
  `{ body: string (max 2000) }` → `201 BookingNote`. Staff-only and append-only: there is no edit or delete route.
  `BookingNote` = `{ id, body, author: { id, fullName } | null, createdAt }`.
- `GET /api/admin/bookings/:id/history` → `AuditLogEntry[]` (plain array, **not** paginated and not wrapped in
  `data`), oldest first, for that booking.
- `PATCH /api/admin/bookings/:id/complete` → `AdminBooking`, moves `approved` →
  `completed`, only on/after the appointment date. `422` if the booking is not currently
  `approved` or the appointment date hasn't arrived yet. Writes an audit-log
  row (`action: 'booking.completed'`, `metadata: { from, to }`). A **wedding** is also refused while a gating
  preparation step is open: `422 { message: 'Cannot complete: these preparation steps are not done — Canonical interview, Pre-Cana seminar.' }`
  (the open gating labels, in checklist order, comma-separated). Every other sacrament is unaffected, and a wedding
  that is already `completed` is not re-checked.

### Wedding preparation (staff/admin)
A wedding booking carries `milestones: Milestone[]` (shape under Shapes) on **every** booking response, lists included;
every other sacrament has `milestones: []`. Derived steps are computed on each read and never stored; only staff ticks
are kept (`booking_milestones`). Rows, in order (`key` — `label` — due — gating — manual):

| key | label | due | gating | manual | done when |
|---|---|---|---|---|---|
| `submitted` | Booking submitted | — | no | no | status is not `draft` |
| `paid` | Fee paid | — | no | no | `paymentStatus` is `paid` or `not_required` |
| `core_documents` | Core documents accepted | — | **yes** | no | every `required` document of the checklist is `accepted` |
| `canonical_interview` | Canonical interview | 60 days before | **yes** | yes | staff tick |
| `banns_requested` | Banns requested | 45 days before | no | yes | staff tick |
| `mixed_marriage_permission` | Permission for a mixed marriage | 30 days before | **yes** | yes | staff tick, note required. **The row is absent** unless `groomReligion` or `brideReligion` is filled in and is not `Catholic` / `Roman Catholic` (letter case and spacing ignored; a blank religion adds no row) |
| `pre_cana` | Pre-Cana seminar | 30 days before | **yes** | yes | `preCanaCertificate` accepted, or staff tick |
| `banns_completed` | Banns completed or dispensed | 14 days before | **yes** | yes | `bannsCertificate` accepted, or staff tick |
| `marriage_license` | Marriage license or Art. 34 affidavit | 14 days before | **yes** | yes | staff tick with the license details or `art34` — an uploaded, even accepted, `marriageLicense` file does not complete it |
| `confession` | Confession | 3 days before | no | yes | `confessionCertificate` accepted, or staff tick |
| `approved` | Booking approved | — | no | no | status is `approved` or `completed` |
| `wedding_day` | Wedding day | — | no | no | status is `completed` |
| `civil_registry` | Marriage certificate sent to the Local Civil Registrar | 15 days **after** | no | yes | staff tick (only once completed) |

So a Catholic couple has 12 rows and a mixed marriage 13. A document that is uploaded but not reviewed, or was rejected, does not complete its step.

`state`: `done` when done; otherwise from `dueDate` and the parish date today — `overdue` when `dueDate < today` **and**
`dueDate >=` the parish date the booking was **first** submitted (the earliest `booking.submitted` audit row; a
resubmission after a return does not move it; the creation date when there is no such row); `due` when
`dueDate < today` otherwise (a short-notice wedding: the couple could never have met it), or when `dueDate` is today
up to 7 days ahead; else `upcoming`. An open row with no `dueDate` is `upcoming`. `dueDate` follows the current
appointment date (a reschedule moves every date) and is `null` on a booking with no appointment date yet.

`source`: `auto` for the five computed rows when done; `staff` when a tick exists (a tick wins over an accepted document);
`document` when an accepted document completed it; `null` while open. `note`, `data` and `doneBy` come from the tick only. The parishioner's `milestones[]` rows never carry `note` or `doneBy`; `data` stays (it is the couple's own license details or the Art. 34 flag, with any `note` key dropped).
`doneAt`: the tick time (`staff`), the review time (`document`), `paidAt` for `paid`, `null` for the other computed rows.

- `PUT /api/admin/bookings/:id/milestones/:key` (staff + admin; group `throttle:60,1`) → `AdminBooking`. Body `{ done: boolean (required), note?: string (≤500) }`.
  `done: false` deletes the tick (no other field needed; unticking a step that is not ticked is a quiet `200`).
  With `done: true`: `note` is **required** for `mixed_marriage_permission` and for an Art. 34 tick. For `marriage_license`
  send either `{ art34: true, note }` or `{ licenseNumber (≤40), issuedOn: 'Y-m-d', issuedAt (place, ≤120) }`; the row's
  `data` is then `{ art34: true }` or `{ licenseNumber, issuedOn, issuedAt }`. Ticking a ticked step replaces its note,
  data, time and `doneBy`. Field errors are the usual `422 { message, errors }`; with a single error `message` is that sentence:
  - `issuedOn` after the parish date today: `The issue date cannot be in the future.`
  - wedding date before `issuedOn`, or more than 120 days after it (day 120 passes, day 121 fails; errors on `issuedOn`):
    `A marriage license is valid for 120 days: issued October 22, 2026, it covers weddings until February 19, 2027.`
  - Moving the wedding (the owner's `PATCH /api/bookings/:id/reschedule` or the office's `PATCH /api/admin/bookings/:id/reschedule`)
    checks the same window against the new date. A `marriage_license` tick whose `issuedOn` no longer covers it is removed in
    the same transaction (audit `milestone.unticked` with `reason: "license no longer valid for the new date"`), every active
    staff member is alerted ("License needs checking"), and the move itself still succeeds. An Art. 34 tick is never removed.
  
  Rule refusals are `422 { message }`, checked before the body's detail fields:
  - `That step cannot be ticked by hand.` — `key` is not one of the eight manual keys.
  - `Only a wedding booking has preparation steps.`
  - `Preparation steps can only be updated while the booking is submitted or approved.` — draft, returned, declined, cancelled.
  - `This wedding is completed. Only the civil registry step can still be updated.` — any key but `civil_registry` on a completed wedding (tick or untick).
  - `The civil registry step opens once the wedding is completed.` — `civil_registry` on a submitted or approved wedding.
  - `This couple does not need permission for a mixed marriage.` — the row is not on this booking.
  
  Runs under the booking lock. Audit `milestone.ticked` (`{ key, label, note, data }`) / `milestone.unticked` (same keys, holding what the removed tick said). No notification is sent.
- `GET /api/admin/bookings/:id/certificate` → the certificate as `text/html` (`Cache-Control: no-store`), rendered from the register entry's frozen snapshot. `404 { message: 'No certificate yet.' }` if the booking has no entry. The old `POST /api/admin/bookings/:id/certificate` (generate) is removed (405); completing a booking records the entry.
- `GET /api/admin/audit-log` → paginated `AuditLogEntry[]` (same envelope as bookings
  above), newest first, each entry includes the acting user's `fullName`/`email`.
  Optional query filters, all combinable: `area` (action-code prefix before the dot, e.g. `booking`, `register`, `id_check`), `q` (matches action code, actor name or email, subject id), `from` / `to` (`YYYY-MM-DD`, parish-local, inclusive). Invalid values give `422`.
- `GET /api/admin/analytics` → `AdminAnalytics` — simple counts for cards/a small
  chart, not a reporting engine. Besides `byStatus`, `bySacrament`, `createdLast7Days`, `createdLast30Days`, `donations` and `attention`, it carries the Dashboard's data:
  `visitsAhead: { date, count }[]` (14 parish days starting tomorrow, appointments that hold a slot, zero days listed),
  `bookingsPerDay: { date, count }[]` (14 parish days ending today, by `created_at`, drafts left out),
  `waitingPreview` (up to 3 of `{ kind: 'hold'|'review'|'refund', bookingId, subjectName, sacrament }` plus `holdExpiresAt` / `submittedAt` / `refundCentavos`; the hold ending soonest, the request that has waited longest, a refund due) and
  `dueSoon` (visits that hold a slot today and in the next two parish days, soonest first, up to 8: `{ bookingId, subjectName, service, date, start, paymentStatus }`; completed visits are left out). It replaces `recentActivity`, which no longer exists.

### Walk-ins (staff/admin)
Bookings the office enters for someone at the counter. They use the same `DraftEditor`, `SacramentRules`,
`SchedulingService` and `BookingStateMachine` as online bookings. `channel` is `walk_in`, `createdBy` is the
acting staff member, and the contact lives in `owner_snapshot`; an account is attached only through an explicit `linkUserId`.
- `POST /api/admin/walk-ins` — `{ sacrament, contact: { fullName (≤120), phone (/^09\d{9}$/), email?, relationship? (≤80) }, formData?, appointmentDate?, appointmentStart?, linkUserId? }` →
  `201 AdminBooking` (a `draft`). Draft rules as `POST /api/bookings` (shape-only; `appointmentDate` not before today). `linkUserId` must be an
  active, email-verified `parishioner` account id (422 otherwise).
- `PATCH /api/admin/walk-ins/:id` — same keys, all optional (`contact`, when sent, needs `fullName` and `phone`; `linkUserId: null` unlinks) → `AdminBooking`.
  Only a walk-in in `draft` or `returned` (422 otherwise; an online booking is never editable here).
- `PATCH /api/admin/walk-ins/:id/submit` — `{ waiveLeadTime?: boolean, waiveReason?: string (≤500, required when `waiveLeadTime`) }` → `AdminBooking`.
  Runs the normal submit (`SacramentRules`, scheduling, 48 h hold when a fee applies); the lead-time waiver is audited. The email-verification gate does not apply.
- `GET /api/admin/parishioners/lookup?email=` (`throttle:30,1,parishioner-lookup`, its own counter because an exact-email lookup is an account oracle, RA 10173) →
  `{ id, fullName }` or `404 { message }` — only active, verified parishioners are findable. Staff confirm the name before sending `linkUserId`.

Until a walk-in is submitted its linked parishioner cannot see or touch it (see Bookings). `AdminBooking.walkInContact` is the source for the desk edit screen.

### Check-in (staff/admin)
- `POST /api/admin/bookings/:id/check-in` → `AdminBooking` with `checkedInAt` and `checkedInBy: { id, fullName }`. A write under the booking lock; the status does not change (completing stays its own action). `422 { message }`: `Only an approved booking can be checked in.` (any other status); `This booking has no appointment to check in for.` (an approved emergency with no date); `Check-in opens on the appointment day (November 6, 2026).` (the appointment date is not the parish date today, past or future); `Already checked in at 2:05 PM.` (parish time). Audit `booking.checked_in`. Unknown id `404`.
- `GET /api/admin/bookings/by-reference/:reference` → `AdminBooking` (single-booking response, with `dayPass.qrSvg`). Case-insensitive, surrounding spaces ignored; `404 { message: 'No booking with that reference.' }` otherwise. Declared before `/bookings/:id`.

### Schedule (staff/admin)
- `GET /api/admin/schedule?start=Y-m-d&end=Y-m-d` (max 62 days, `422` beyond) → `AdminSchedule`:
  everything that occupies the one priest, day by day, from the same `holdingSlot()` scope the scheduler enforces.
  A `booking` item also carries `contactName`, `contactRelationship` (walk-ins only, else `null`), `contactPhone` and `location` (the off-site address, `null` for an at-the-church visit); the Dashboard's Call button and printed day sheet read them.

### Parish register (staff/admin; correct, revoke and reinstate are **admin only**, 403 for staff)
Every completed booking has one register entry (`BAP-2026-0007`; prefixes BAP, CON, MAR, DEA, ANO, BLS, else SVC). Entries copied from the paper book are `source: 'transcribed'`. Audit rows use `subjectType: 'register_entry'`; actions `register.recorded`, `register.transcribed`, `register.corrected` (`metadata: { before, after, reason }`), `register.paper_reference` (`{ before, after }`), `register.revoked`, `register.reinstated`.
- `GET /api/admin/register?sacrament=&year=&status=valid|revoked&source=system|transcribed&search=&page=&perPage=` -> paginated `RegisterEntry[]` (`{ data, links, meta }`), newest first. `search` is a case-insensitive partial match on `subjectName` or `registerNumber`. `perPage` 1-100, default 15; an unknown filter value is `422`.
- `GET /api/admin/register/:id` -> `RegisterEntry` plus `history: AuditLogEntry[]` (oldest first, same shape as `GET /api/admin/bookings/:id/history`).
- `GET /api/admin/register/:id/certificate` -> the certificate as `text/html` (`no-store`).
- `POST /api/admin/register` (transcribe) -> `201 RegisterEntry`. Body `{ sacrament: baptism|confirmation|wedding|funeral, ceremonyDate: 'Y-m-d' (1500-01-01 to today; an earlier year is `422` on `ceremonyDate`: `Check the year of the ceremony date.`), subjectName (<=160), minister (<=120), details?: [{ label (<=60), value (<=200) }] (<=12; rows with a blank value are dropped), bookNo (required, <=20), pageNo (required, <=20), lineNo? (<=20), confirmDuplicate?: boolean }`. Numbered in the ceremony's year (a 1998 baptism is `BAP-1998-0001`). The same book, page and line (a missing line equals a missing line) in the same register is `422 { message: 'This book entry is already in the register as BAP-1998-0001.' }` (not overridden by `confirmDuplicate`). The same register, ceremony date and name (case-insensitive) without `confirmDuplicate: true` is `409 { message, duplicates: [{ id, registerNumber }] }`. Field errors are the usual `422 { message, errors }`.
- `PATCH /api/admin/register/:id` (**admin only**, correct) -> `RegisterEntry`. Body `{ reason (required, <=500) }` plus at least one of `subjectName, ceremonyDate, minister, details`. `ceremonyDate` follows the same 1500-01-01 lower bound and message. A correction whose values all equal the stored ones is `422 { message: 'Nothing was changed.' }` and writes nothing. Number, year and verification code never change; sets `correctedAt`. A new `ceremonyDate` also rewrites the long-form date inside the statement and (unless `details` is sent too) the detail rows. A revoked entry is `422 { message }`.
- `PATCH /api/admin/register/:id/paper-reference` (staff + admin) -> `RegisterEntry`. Body `{ bookNo?, pageNo?, lineNo? }`, each nullable (null clears); same `422` as above when another entry has that paper line.
- `POST /api/admin/register/:id/revoke` and `/reinstate` (**admin only**) -> `RegisterEntry`. Body `{ reason (required, <=500) }`. Revoking a revoked entry or reinstating a valid one is `422 { message }`. A revoked entry still verifies, as `status: 'revoked'`, and its certificate shows REVOKED with no QR. Reinstating clears `revokedReason`, `revokedAt`.

`RegisterEntry` = `{ id, registerNumber, sacrament, register ('Baptism'|'Confirmation'|'Marriage'|'Death'|'Anointing of the Sick'|'Blessing'|'Service'), year, sequence, source: 'system'|'transcribed', status: 'valid'|'revoked', subjectName, ceremonyDate: 'Y-m-d', bookNo, pageNo, lineNo, verifiable: boolean, verifyCode: 'XXXX-XXXX-XXXX'|null, verifyUrl: string|null, snapshot: { subjectName, ceremonyDate, minister, parishName, parishAddress, title, statement, details: [{ label, value }] }, bookingId: string|null, bookingReference: string|null, revokedReason, revokedAt, correctedAt, enteredBy: { id, fullName }|null, enteredAt }`. `verifyCode`/`verifyUrl` are `null` (and `verifiable` false) for an anointing, which is private. Staff and admin see the code; it is never in the public `/verify` answer.

### Certificate requests (staff/admin)
`AdminCertificateRequest` = `CertificateRequest` + `{ requester: { fullName, email, phone }, idUrl: string|null, letterUrl: string|null, filesRemovedAt: string|null, handledBy: { id, fullName }|null }`. `requester` falls back to what was kept at submission once the account is deleted. The files open through `GET /api/documents/:userId/:filename` (staff may open any stored file). Audit rows use `subjectType: 'certificate_request'`; actions `certificate_request.issued` (`{ reference, registerEntryId, registerNumber }`), `.declined` (`{ reference, reason }`), `.cancelled`, and `certificate_requests.files_pruned` (`{ count }`).
- `GET /api/admin/certificate-requests?status=submitted|issued|declined|cancelled&search=&page=&perPage=` -> paginated `AdminCertificateRequest[]` (`{ data, links, meta }`). `search` is a case-insensitive partial match on reference, person name or requester name. Open requests first, oldest first; closed ones after, newest first. `perPage` 1-100, default 15; an unknown `status` is `422`.
- `GET /api/admin/certificate-requests/:id` -> `AdminCertificateRequest`.
- `POST /api/admin/certificate-requests/:id/issue` -> `200 AdminCertificateRequest` (`issued`). Body `{ registerEntryId }` (must exist: `422` on the field otherwise). `422 { message }` when the request is not `submitted` (`Only a request that is still waiting can be issued or declined.`), the entry is revoked (`That entry is revoked.`) or is in another register (`That entry is in the {register} register.`, e.g. `Marriage`). Sets `registerEntry`, `handledBy`, `closedAt`; notifies the requester in-app (`Certificate ready`, with the register number).
- `POST /api/admin/certificate-requests/:id/decline` -> `200 AdminCertificateRequest` (`declined`). Body `{ reason (required, <=500) }`; same not-`submitted` refusal as issue. Notifies the requester with the reason.
- The dashboard's `attention.certificateRequests` (`GET /api/admin/analytics`) is the count of `submitted` requests.

### Settings and closures
- `GET /api/admin/settings` (staff/admin) → `{ parish, services: AdminService[], policy, triduum }`. `parish` =
  `{ parishName, parishAddress, priestName, parishPhone, workingHoursStart, workingHoursEnd, slotStepMinutes, travelBufferMinutes, priestTitle, priestSignature }`.
  `priestTitle` defaults to `Parish Priest`; `priestSignature` is a `data:image/png|jpeg;base64,...` URL or `null`. Both feed the signature block printed on certificates
  and on the office copy of the baptism registration form. The signature image is returned only here and in the PATCH response; no public route carries it.
  `policy` = `{ paymentHoldHours, returnedHoldDays, changeCutoffDays }` (read-only). `triduum` = `{ date, reason }[]` for this and next year.
- `PATCH /api/admin/settings/parish` (**admin only**) — any subset of the `parish` keys → the full `parish` object. `parishName`/`priestName` 3–120 chars; `parishAddress` 3–160 chars (printed on new certificates; existing entries keep the address they were recorded with); `parishPhone`
  `09XXXXXXXXX` or `(0XX) XXX-XXXX`; hours `H:i` with end after start (`422` keyed to the offending field); `slotStepMinutes` ∈ {15, 30, 60};
  `travelBufferMinutes` 0–120; `priestTitle` 3–80 chars; `priestSignature` a PNG or JPEG data URL of at most 200 KB and 2000 × 2000 pixels, or `null` to remove it.
  The image is decoded and its real type decides what is stored (the declared type is not trusted); anything else is `422` on `priestSignature`
  (`Upload the signature as a PNG or JPEG image.` / `The signature image must be 200 KB or smaller.` / `... at most 2000 × 2000 pixels.` /
  `The signature image could not be read. Upload a PNG or JPEG file.`). Audit `settings.parish_updated` `{ before, after }` (changed keys only;
  a signature appears as `PNG image, <n> bytes, sha256 <12 hex>`, never the image).
- `PATCH /api/admin/settings/services/:id` (**admin only**) — any subset of `name, description, feeRule (none|flat|per_sponsor), priceCentavos, durationMinutes (15–480),
  allowedWeekdays (ISO 1–7), leadTimeDays (0–365), dailyCapacity (1–50|null), sessionWeekdays, sessionTimes, sessionCapacity (1–200), sessionDurationMinutes` → `AdminService`.
  Session keys are `422` for a service without fixed sessions; `per_sponsor` only for baptism/confirmation/wedding; a fee rule other than `none` needs a price ≥ 1 centavo
  (`none` clears the price). Audit `settings.service_updated`. Seeders no longer overwrite these edits on redeploy.
- `GET /api/admin/blackouts` (staff/admin) → `Blackout[]` (plain array): closures dated today (Manila) or later, by date.
  `Blackout` = `{ id: number, date, reason, sacraments: string[] | null }` (`null` = every service).
- `POST /api/admin/blackouts` — `{ date, endDate?, reason (3–120), sacraments?: Sacrament[] (≥1) }` → `201 { blackouts: Blackout[], affectedBookings: AffectedBooking[] }`. One row per day
  (max 31 days; an identical existing row is not duplicated). Existing appointments are **kept**; `affectedBookings` = `{ id, referenceNumber, sacrament, subjectName, appointmentDate, appointmentStart }[]`
  lists those on the closed days so staff can call or move them. Audit `blackout.created`.
- `DELETE /api/admin/blackouts/:id` → `204`. Audit `blackout.deleted`.

### Reports and CSV (staff/admin)
Both take `from`, `to` (`Y-m-d`, required, `to >= from`, at most 366 days apart → `422`) and optional `sacrament`. Bookings are selected as in the queue's `from`/`to` filter; drafts excluded.
- `GET /api/admin/reports/summary` → `{ range: { from, to }, totals: { bookings, completed, declined, cancelled, online, walkIn, urgent },
  bySacrament: { sacrament, name, total, byStatus: Record<status, number> }[], money: { collectedCentavos, refundedCentavos, refundDueCentavos, overpaidCentavos } }`.
  `collected` = `amountPaidCentavos` of bookings paid in range; `refunded` sums `booking.refunded` and `booking.partial_refund` audit rows in range;
  `refundDue` and `overpaid` are what is outstanding today, not range-bound.
  The same response also carries (Manila calendar days): `monthly: { month: 'YYYY-MM', bookings, byStatus, donationsCentavos, certificatesIssued }[]`
  (one row per calendar month the range touches; bookings by appointment date, undated by request date; `donationsCentavos` = paid `Donation`s by `paid_at`;
  `certificatesIssued` = certificate requests with status `issued` by `closed_at`), `byWeekday: number[7]` (Monday first), `donations: { totalCentavos, count }`,
  `certificates: { issued }`, and `previous: { range, bookings, completed, donationsCentavos, certificatesIssued }` for the period of equal length ending the day before `from`.
- **Sessions vs working hours** (both settings writes): a service session must start at or after opening and end (start + session duration) at or before closing. Saving `sessionTimes` / `sessionDurationMinutes` that break this is `422` on `sessionTimes` with `Session at 18:00 falls outside working hours (08:00–17:00).` (the first offending time). Saving `workingHoursStart` / `workingHoursEnd` that would strand a service session is `422` on the field sent (the end when both) with `Baptism's session at 10:00 would fall outside the new working hours (08:00–10:30).`
- `GET /api/admin/reports/bookings.csv` → `text/csv; charset=UTF-8` attachment `bookings-<from>-to-<to>.csv`, UTF-8 BOM, columns
 A cell whose first non-space/tab/newline character is `= + - @` (or that starts with a tab or CR) is prefixed with `'`.
  `Reference, Service, For, Contact, Phone, Email, Date, Start, End, Status, Payment, Fee, Paid, Channel, Requested`; money in pesos with two decimals, ordered by appointment (undated last). Cells starting with `= + - @` or tab/CR are prefixed with `'` (CSV injection). Audit `report.exported`.

### Priority ordering rule (judgment call — see `Admin\BookingController::paginatedByPriority`)
When `priority=1` is passed to `GET /api/admin/bookings`, matched bookings are sorted:
1. Emergency bookings (`isEmergency` — anointing for someone in danger of death) first.
2. Then `Booking::PRIORITY_SACRAMENTS` (`funeral`, `anointing`) as a group — both
   time-sensitive by nature (a funeral has the deceased already present; anointing is
   a sick call).
3. Within each group, soonest appointment first: ascending `appointmentDate`, then
   `appointmentStart`. Bookings with no appointment date yet sort after dated ones.
4. Ties (and undated bookings) fall back to `createdAt` ascending (oldest request first).

## Admin — User management (item 21, `role:admin` only — 403 for `staff` too)
All routes below require `Authorization: Bearer <token>` for a user whose `role` is
`admin`. Deliberately narrower than the bookings/audit-log/analytics admin routes above
(which allow `staff` too): staff creating other staff/admin accounts, or changing roles
(including their own), is a real privilege-escalation question this app doesn't take on
by default. The two settings writes (`PATCH /api/admin/settings/parish`, `/settings/services/:id`) are in this admin-only group too. `config/roles.php` is the single source of truth for the valid role list —
nothing here (or in `RegisterRequest`) hardcodes `parishioner`/`staff`/`admin` separately.

- `GET /api/admin/users?role=&search=` → paginated `User[]` (same paginator envelope as
  `GET /api/admin/bookings`). `search` matches case-insensitively/partially against
  `fullName`/`email`, same pattern as the bookings search (item 16).
- `POST /api/admin/users` — `{ fullName, email, phone?, password, role }` → `User`
  (`201`). `role` must be `staff` or `admin` (`config('roles.admin_creatable')`) —
  self-registration (`POST /api/register`) remains the only path to `parishioner`, and
  does not accept a `role` field from the request at all. The created account's
  `emailVerifiedAt` is set immediately (an admin-provisioned account is inherently
  trusted, mirroring the same judgment call already made for staff/admin elsewhere) and
  its password is exactly what the admin sets here — no invite-email flow, zero
  additional cost, but the admin must relay the password to the new user out of band.
- `PATCH /api/admin/users/{id}/role` — `{ role }` → `User`. `role` must be one of the
  full list (`config('roles.all')`) — unlike creation, a role change can also demote
  staff/admin back to `parishioner`. `422` if this would leave the app with zero active
  admins (the last-admin-standing guard: demoting the only remaining active `admin`).
- `PATCH /api/admin/users/{id}/deactivate` → `User`. Sets `isActive: false` — chosen over
  hard deletion so a user's historical bookings/audit-log rows are never orphaned or
  destroyed (the audit log was fixed in a prior round specifically to survive a deleted
  actor). A deactivated account can no longer log in (`POST /api/login` rejects it with
  a clear message) but every existing record referencing it is untouched. `422` under
  the same last-admin-standing guard as the role-change route.
- `PATCH /api/admin/users/{id}/activate` → `User`. Reverses a deactivation.

### Parish events (staff/admin — `role:staff,admin`, same level as bookings above)
Previously `parish_events` had zero create/update/delete path at all — the only data
ever in the table came from `ParishEventSeeder`. Does not affect the public,
unauthenticated `GET /api/events/upcoming` (`ParishEventController`, unchanged).
- `GET /api/admin/parish-events` → paginated `AdminParishEvent[]` (same paginator
  envelope as bookings/users), ordered newest-date first. Optional `?when=upcoming` (date from
  now on, soonest first) or `?when=past` (date before now, most recent first); any other value is
  `422`. No `when` keeps the unfiltered, newest-first list.
- `POST /api/admin/parish-events` — `{ title, date, location, imageUrl?, category }` →
  `AdminParishEvent` (`201`). `category` must be one of `config('parish_events.categories')`.
  `createdBy` is set to the acting user's id. Writes an audit-log row
  (`action: 'parish_event.created'`).
- `PATCH /api/admin/parish-events/{id}` — same body shape as create → `AdminParishEvent`.
  Writes an audit-log row (`action: 'parish_event.updated'`).
- `DELETE /api/admin/parish-events/{id}` → `204`. Writes an audit-log row
  (`action: 'parish_event.deleted'`) before the row is removed. `parish_events.created_by`
  is a nullable, `nullOnDelete` FK to `users` (no denormalized snapshot — an event's
  title/date/location/category stay fully meaningful with no reference to who created
  it, unlike a booking's owner), so deleting the creator's account leaves the event
  intact with `createdBy: null`.

```ts
type AdminParishEvent = ParishEvent & {
  createdBy: string | null
  createdByName: string | null
  createdAt: string
  updatedAt: string
}
```

## Notifications
- `GET /api/notification-preferences` → `NotificationPreferences`
- `PATCH /api/notification-preferences` — `Partial<NotificationPreferences>` → `NotificationPreferences`
- `GET /api/notifications` → `AppNotification[]` = `{ id, title, body, category, read, icon, bookingId: string | null, link: string | null, createdAt }`.
  `link` is an admin-app path the notification opens (for example `/certificate-requests/{id}`); null unless the server wrote one
  (a relative admin-app path, never user input).
  `bookingId` is the booking the notification is about (the app opens `/booking/history/{bookingId}`); `null` for anything else
  and for a booking that has since been deleted. The same events are also emailed to the person (see DEPLOYMENT.md, "Mail and
  queue"): booking returned, approved, declined, cancelled by the office, payment received, refund processed (full and partial),
  rescheduled by the office, sacrament recorded, a later wedding document not accepted, and a certificate request issued or
  declined. Never emailed: what the person did themselves, and staff alerts. Account deletion marks the person's bookings
  `owner_snapshot.accountDeleted = true`, after which nothing is emailed for them.
- `POST /api/notifications/mark-all-read` → `204`
- `POST /api/notifications/:id/read` → `204`. Marks one of the caller's own notifications read; `404` for anyone else's or an unknown id.

## Shapes

```ts
type Sacrament = 'baptism' | 'wedding' | 'confirmation' | 'funeral' | 'anointing' | 'house-blessing'
// Lifecycle (owned by App\Services\Booking\BookingStateMachine):
//   draft -> submitted -> approved -> completed   (happy path)
//   submitted -> returned -> submitted            (staff return it for changes)
//   submitted/returned/approved -> declined       (staff decline; `statusReason` explains why)
//   draft/submitted/returned/approved -> cancelled
type BookingStatus = 'draft' | 'submitted' | 'returned' | 'approved' | 'completed' | 'declined' | 'cancelled'
type PaymentStatus = 'not_required' | 'unpaid' | 'pending_cash' | 'paid' | 'refund_due' | 'refunded' | 'void'
type Role = 'parishioner' | 'staff' | 'admin'

interface User {
  id: string
  fullName: string
  email: string
  phone: string
  address: string
  birthDate: string | null // 'Y-m-d'
  sex: string | null
  civilStatus: string | null
  addressLine: string | null
  addressPsgc: string | null
  homeParish: string | null
  role: Role
  isActive: boolean
  emailVerifiedAt: string | null // ISO 8601
}

interface Service {
  id: string
  sacrament: Sacrament
  name: string
  description: string
  priceCentavos: number | null // null = "contact parish"
  feeRule: string
  durationMinutes: number
  offsite: boolean
  allowedWeekdays: number[] // ISO weekdays, 1 = Monday … 7 = Sunday
  leadTimeDays: number
  dailyCapacity: number | null
  sessionWeekdays: number[] | null
  sessionTimes: string[] | null // 'H:i'
  sessionCapacity: number | null
}

interface Booking {
  id: string
  referenceNumber: string // e.g. "BAPT-20260905-K3F9" (dated by the parish/Manila day), never the UUID
  userId: string | null // null for a walk-in with no linked account
  sacrament: Sacrament
  status: BookingStatus
  statusLabel: string
  formData: Record<string, unknown> // keys per the Field Dictionary
  appointmentDate: string | null // 'Y-m-d'
  appointmentStart: string | null // 'H:i'
  appointmentEnd: string | null // 'H:i'
  isEmergency: boolean
  paymentStatus: PaymentStatus | null // null for drafts
  amountDueCentavos: number | null // live quote while draft/returned, frozen snapshot afterwards
  paymentHoldExpiresAt: string | null // ISO 8601
  paidAt: string | null // ISO 8601
  paymentReference: string | null // PayMongo payment id ("pay_...")
  paymentMethod: 'gcash' | 'cash' | null // null until a method is chosen or a payment lands
  cashReceiptReference: string | null // the office's receipt number for cash, optional
  refundReference: string | null
  refundedAt: string | null // ISO 8601
  statusReason: string | null
  returnNote: string | null
  channel: 'online' | 'walk_in'
  amountPaidCentavos: number | null // what PayMongo actually collected; null until paid
  amountRefundedCentavos: number // 0 when nothing was refunded
  overpaidCentavos: number // paid − refunded − due, never negative
  documents: BookingDocument[] // the service's checklist; a non-required document appears only once uploaded
  milestones: Milestone[] // a wedding's preparation checklist (see "Wedding preparation"); [] for every other sacrament; present in lists too
  checkedInAt: string | null // ISO 8601, set by staff check-in
  dayPass: { url: string; qrSvg?: string } | null // approved + appointment only; qrSvg is present on single-booking responses only, never in lists
  createdAt: string // ISO 8601
}

interface Milestone {
  key: 'submitted' | 'paid' | 'core_documents' | 'canonical_interview' | 'banns_requested' | 'mixed_marriage_permission'
    | 'pre_cana' | 'banns_completed' | 'marriage_license' | 'confession' | 'approved' | 'wedding_day' | 'civil_registry'
  label: string
  done: boolean
  state: 'done' | 'due' | 'overdue' | 'upcoming'
  source: 'auto' | 'document' | 'staff' | null // null while open
  dueDate: string | null // 'Y-m-d'
  gating: boolean // must be done before the wedding can be marked completed
  manual: boolean // staff can tick it
  note: string | null // the tick's note; AdminBooking only: the parishioner's `Booking` rows leave it out (staff wording is not for the couple)
  doneAt: string | null // ISO 8601
  data: { licenseNumber: string; issuedOn: string; issuedAt: string } | { art34: true } | null // marriage_license tick only
}
// AdminBooking rows add: doneBy: { id: string; fullName: string | null } | null (who ticked; null unless source is 'staff')

interface BookingDocument {
  key: string // formData key, e.g. 'birthCertificate'
  label: string
  required: boolean
  url: string | null // '/documents/:userId/:filename', null if not uploaded
  // null until staff review the file currently attached; resets when the file is replaced
  review: { status: 'accepted' | 'rejected'; note: string | null; reviewedAt: string | null } | null
}

interface AdminBooking extends Omit<Booking, 'documents'> {
  user: { fullName: string; email: string | null; phone: string | null; idStatus?: 'not_submitted' | 'pending' | 'verified' | 'needs_new_photo' | null } // owner, or the walk-in contact / deleted-account snapshot. idStatus is present only on GET /admin/bookings/:id; null for a walk-in with no account
  walkInContact: { fullName: string | null; phone: string | null; email: string | null; relationship: string | null } | null // null unless channel === 'walk_in'
  subjectName: string // who the sacrament is for
  createdBy: { id: string; fullName: string | null } | null // staff who entered a walk-in
  isPriority: boolean
  documents: (Omit<BookingDocument, 'review'> & { review: (NonNullable<BookingDocument['review']> & { reviewedBy: string | null }) | null })[] // staff also see the reviewer's name
  checkoutSessionId: string | null
  checkedInBy: { id: string; fullName: string | null } | null
}

interface AdminService extends Omit<Service, 'sacrament' | 'priceCentavos'> {
  priceCentavos: number | null
  hasSessions: boolean
  sessionDurationMinutes: number | null
  sponsorFeeAllowed: boolean // per_sponsor fee rule available (baptism, confirmation, wedding)
}

type ScheduleItem =
  | { type: 'mass'; title: string; start: string; end: string }
  | { type: 'session'; sacrament: Sacrament; start: string; end: string; booked: number; capacity: number }
  | { type: 'booking'; id: string; referenceNumber: string; sacrament: Sacrament; subjectName: string; start: string; end: string | null;
      status: BookingStatus; paymentStatus: PaymentStatus | null; isOffsite: boolean; channel: 'online' | 'walk_in'; inSession: boolean; checkedInAt: string | null }

interface AdminSchedule {
  travelBufferMinutes: number
  days: { date: string; blackouts: { reason: string; appliesTo: string }[]; items: ScheduleItem[] }[] // items by start time: mass, session, booking on ties
  // urgent requests with no slot: emergency bookings that are submitted, returned or approved
  unscheduled: { id: string; referenceNumber: string; subjectName: string; contactPhone: string | null; status: BookingStatus; createdAt: string }[]
}

interface AuditLogEntry {
  id: string
  action: string // e.g. 'booking.approved' | 'booking.declined' | 'booking.completed'
  subjectType: string // e.g. 'booking'
  subjectId: string
  metadata: Record<string, unknown>
  actor: { id: string; fullName: string; email: string }
  createdAt: string // ISO 8601
}

interface AdminAnalytics {
  byStatus: Record<BookingStatus, number> // only statuses with at least one booking are present
  bySacrament: Record<Sacrament, number> // only sacraments with at least one booking are present
  createdLast7Days: number
  createdLast30Days: number
  // holdsExpiringSoon: submitted bookings still awaiting payment (unpaid or pending_cash) whose hold ends within 12 hours
  attention: { awaitingReview: number; urgentOpen: number; refundDue: number; overpaid: number; todayAppointments: number; holdsExpiringSoon: number; certificateRequests: number; idChecks: number }
}

// Single source of truth: config('parish_events.categories') — validated via
// Rule::in() on the admin create/update routes above.
type ParishEventCategory = 'mass' | 'feast' | 'seminar' | 'fundraiser' | 'community' | 'notice' | 'general'

interface ParishEvent {
  id: string
  title: string
  date: string // ISO 8601
  location: string
  imageUrl: string
  category: ParishEventCategory
}

interface NewBookingInput {
  userId: string
  sacrament: Sacrament
  formData: Record<string, unknown>
}

interface NotificationPreferences {
  pushEnabled: boolean
  bookingReminders: boolean
  parishAnnouncements: boolean
}

interface AppNotification {
  id: string
  title: string
  body: string
  category: 'today' | 'earlier'
  read: boolean
  icon: 'calendar' | 'booking' | 'announcement'
  createdAt: string | null // ISO 8601
}
```

## Demo data
`DemoBookingSeeder` (runs on every deploy) seeds seven `DEMO-*` bookings: one per service plus `DEMO-WALK`, an approved walk-in house blessing
(`channel: 'walk_in'`, no account, contact "Aling Rosa Dela Cruz", `createdBy` = `staff@example.com`; skipped with a log line when that account is missing).
A demo row is deleted and re-seeded when the expiry job cancelled it (`statusReason` starts with `Payment not completed` or `Not resubmitted`) or when it is
`submitted`/`returned`/`approved` with an appointment day before parish-today; any other existing demo row is left exactly as staff left it. Approved and completed
demo rows carry an `accepted` review for every uploaded document.
