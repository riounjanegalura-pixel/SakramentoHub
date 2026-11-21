# SakramentoHub data dictionary

Source: the migrated database (`backend/database/database.sqlite`, all 39 migrations applied, last one
`2026_11_06_000100_remove_id_verification`), read with `PRAGMA table_info`, `foreign_key_list` and `index_list`.
22 application tables. Not listed: `cache`, `cache_locks`, `jobs`, `job_batches`, `failed_jobs`, `migrations`.

Notation: **PK** primary key, **FK** foreign key (with its delete rule), **UQ** unique, **NN** not null, `datetime`
columns are nullable unless marked. JSON columns are stored as TEXT. Money is whole centavos (integer).
Types are those SQLite reports (Laravel `string` shows as `varchar`, `boolean` as `tinyint(1)`).

Delete rules: **SET NULL** keeps the row and blanks the link; **CASCADE** deletes the row with its parent.

## 1. Accounts and access

### users
| Column | Type | Key / null | Default | Note |
|---|---|---|---|---|
| id | varchar | PK | | |
| full_name | varchar | NN | | |
| email | varchar | NN, UQ | | |
| phone | varchar | NN | '' | |
| address | varchar | NN | '' | |
| email_verified_at | datetime | | | |
| password | varchar | NN | | hashed |
| remember_token | varchar | | | |
| role | varchar | NN | 'parishioner' | `parishioner` or `admin` (legacy `staff` is accepted by the admin routes, nothing creates it) |
| privacy_consent_at | datetime | | | |
| is_active | tinyint(1) | NN | 1 | |
| birth_date | date | | | |
| sex | varchar | | | |
| civil_status | varchar | | | |
| address_line | varchar | | | |
| address_psgc | TEXT | | | JSON, PSGC address codes |
| home_parish | varchar | NN | 'St. Peter the Apostle Parish, Balagtas' | |
| created_at, updated_at | datetime | | | |

### personal_access_tokens (Sanctum login tokens)
| Column | Type | Key / null | Note |
|---|---|---|---|
| id | INTEGER | PK | |
| tokenable_type | varchar | NN | polymorphic owner (the `User` model) |
| tokenable_id | varchar | NN | the owner's id. **No database FK** (polymorphic) |
| name | TEXT | NN | |
| token | varchar | NN | hashed |
| abilities | TEXT | | |
| last_used_at, expires_at | datetime | | `expires_at` is indexed |
| created_at, updated_at | datetime | | |

### sessions
| Column | Type | Key / null | Note |
|---|---|---|---|
| id | varchar | PK | |
| user_id | varchar | | **no database FK** |
| ip_address | varchar | | |
| user_agent | TEXT | | |
| payload | TEXT | NN | |
| last_activity | INTEGER | NN | indexed |

### email_verification_tokens
| Column | Type | Key / null | Note |
|---|---|---|---|
| email | varchar | PK | keyed by email, **no FK** to users |
| token | varchar | NN | |
| code | varchar | | |
| created_at | datetime | | |

### password_reset_tokens
| Column | Type | Key / null | Note |
|---|---|---|---|
| email | varchar | PK | keyed by email, **no FK** to users |
| token | varchar | NN | |
| created_at | datetime | | |

### notification_preferences
| Column | Type | Key / null | Default |
|---|---|---|---|
| id | varchar | PK | |
| user_id | varchar | NN, UQ, FK users.id (CASCADE) | |
| push_enabled | tinyint(1) | NN | 1 |
| booking_reminders | tinyint(1) | NN | 1 |
| parish_announcements | tinyint(1) | NN | 1 |
| created_at, updated_at | datetime | | |

## 2. Services and bookings

### services (six rows: Baptism, Wedding, Confirmation, Funeral Mass, Anointing of the Sick, House Blessing)
| Column | Type | Key / null | Default | Note |
|---|---|---|---|---|
| id | varchar | PK | | |
| sacrament | varchar | NN | | |
| name | varchar | NN | | |
| description | TEXT | NN | | |
| price_centavos | INTEGER | | | |
| fee_rule | varchar | NN | 'flat' | |
| duration_minutes | INTEGER | NN | 60 | |
| offsite | tinyint(1) | NN | 0 | |
| allowed_weekdays | TEXT | | | JSON |
| lead_time_days | INTEGER | NN | 0 | |
| daily_capacity | INTEGER | | | |
| session_weekdays | TEXT | | | JSON, group sessions |
| session_times | TEXT | | | JSON |
| session_capacity | INTEGER | | | |
| session_duration_minutes | INTEGER | | | |
| created_at, updated_at | datetime | | | |

### bookings (the central table)
| Column | Type | Key / null | Default | Note |
|---|---|---|---|---|
| id | varchar | PK | | |
| reference_number | varchar | UQ | | |
| user_id | varchar | FK users.id (SET NULL) | | the owner; null for a walk-in with no account |
| owner_snapshot | TEXT | | | JSON copy of the owner's details |
| sacrament | varchar | NN, FK services.id (no action) | | |
| status | varchar | NN | 'draft' | draft, submitted, returned, approved, completed, declined, cancelled |
| status_reason | TEXT | | | |
| return_note | TEXT | | | |
| returned_at | datetime | | | |
| form_data | TEXT | NN | | JSON, the sacrament form |
| appointment_date | date | | | |
| appointment_start | varchar | | | time |
| appointment_end | varchar | | | time |
| is_offsite | tinyint(1) | NN | 0 | |
| is_emergency | tinyint(1) | NN | 0 | |
| channel | varchar | NN | 'online' | online or walk_in |
| created_by | varchar | FK users.id (SET NULL) | | staff member who made a walk-in |
| payment_status | varchar | | | not_required, unpaid, pending_cash, paid, refund_due, refunded, void |
| payment_method | varchar | | | |
| amount_due_centavos | INTEGER | | | |
| amount_paid_centavos | INTEGER | | | |
| amount_refunded_centavos | INTEGER | NN | 0 | |
| payment_hold_expires_at | datetime | | | |
| paid_at | datetime | | | |
| paymongo_checkout_session_id | varchar | | | |
| paymongo_payment_id | varchar | | | |
| cash_receipt_reference | varchar | | | |
| refund_reference | varchar | | | |
| refunded_at | datetime | | | |
| checked_in_at | datetime | | | |
| checked_in_by | varchar | FK users.id (SET NULL) | | |
| created_at, updated_at | datetime | | | |

### booking_document_reviews
| Column | Type | Key / null | Note |
|---|---|---|---|
| id | INTEGER | PK | |
| booking_id | varchar | NN, FK bookings.id (CASCADE) | UQ with document_key |
| document_key | varchar | NN | |
| file_url | varchar | NN | the exact file that was reviewed |
| status | varchar | NN | |
| note | TEXT | | |
| reviewed_by | varchar | FK users.id (SET NULL) | |
| created_at, updated_at | datetime | | |

### booking_milestones (wedding preparation steps)
| Column | Type | Key / null | Note |
|---|---|---|---|
| id | INTEGER | PK | |
| booking_id | varchar | NN, FK bookings.id (CASCADE) | UQ with key |
| key | varchar | NN | |
| done_at | datetime | NN | |
| done_by | varchar | FK users.id (SET NULL) | |
| note | TEXT | | |
| data | TEXT | | JSON |
| created_at, updated_at | datetime | | |

### booking_notes (internal staff notes, append-only)
| Column | Type | Key / null | Note |
|---|---|---|---|
| id | INTEGER | PK | |
| booking_id | varchar | NN, FK bookings.id (CASCADE) | |
| author_id | varchar | FK users.id (SET NULL) | |
| body | TEXT | NN | |
| created_at | datetime | | no `updated_at` |

### sent_reminders (no duplicate reminder emails)
| Column | Type | Key / null | Note |
|---|---|---|---|
| booking_id | varchar | NN, FK bookings.id (CASCADE) | |
| kind | varchar | NN | |
| subject | varchar | NN | |
| sent_at | datetime | NN | |

No single-column primary key; the unique key is (booking_id, kind, subject).

### wallet_documents
| Column | Type | Key / null | Note |
|---|---|---|---|
| id | varchar | PK | |
| user_id | varchar | NN, FK users.id (CASCADE) | indexed |
| kind | varchar | NN | |
| person_name | varchar | NN | |
| file_url | varchar | NN | |
| original_name | varchar | NN | |
| mime | varchar | NN | |
| size_bytes | INTEGER | NN | |
| created_at, updated_at | datetime | | |

## 3. Register and certificates

### register_entries (the Digital Parish Register)
| Column | Type | Key / null | Default | Note |
|---|---|---|---|---|
| id | varchar | PK | | |
| sacrament | varchar | NN | | |
| year | INTEGER | NN | | ceremony year |
| sequence | INTEGER | NN | | |
| register_number | varchar | NN | | for example BAP-2026-0007 |
| verify_code | varchar | | | 12 characters, printed on the certificate |
| booking_id | varchar | UQ, FK bookings.id (SET NULL) | | null for entries typed from the paper book |
| source | varchar | NN | 'system' | |
| subject_name | varchar | NN | | |
| ceremony_date | date | NN | | |
| book_no, page_no, line_no | varchar | | | paper book location |
| snapshot | TEXT | NN | | JSON, what the certificate says |
| status | varchar | NN | 'valid' | |
| revoked_reason | TEXT | | | |
| revoked_by | varchar | FK users.id (SET NULL) | | |
| revoked_at | datetime | | | |
| corrected_at | datetime | | | |
| entered_by | varchar | FK users.id (SET NULL) | | |
| created_at, updated_at | datetime | | | |

### register_sequences (counter per sacrament and year)
| Column | Type | Key / null | Default |
|---|---|---|---|
| id | INTEGER | PK | |
| sacrament | varchar | NN | |
| year | INTEGER | NN | |
| last_number | INTEGER | NN | 0 |

Unique key: (sacrament, year).

### certificate_requests
| Column | Type | Key / null | Default | Note |
|---|---|---|---|---|
| id | varchar | PK | | |
| reference_number | varchar | NN, UQ | | |
| user_id | varchar | FK users.id (SET NULL) | | |
| owner_snapshot | TEXT | | | JSON |
| sacrament | varchar | NN | | |
| person_name | varchar | NN | | |
| sacrament_date_text | varchar | NN | | |
| details | TEXT | | | |
| relationship | varchar | NN | | |
| purpose | varchar | NN | | |
| id_url | varchar | | | ID photo, deleted 30 days after closing |
| letter_url | varchar | | | authorisation letter |
| status | varchar | NN | 'submitted' | |
| decline_reason | varchar | | | |
| register_entry_id | varchar | FK register_entries.id (SET NULL) | | |
| handled_by | varchar | FK users.id (SET NULL) | | |
| closed_at | datetime | | | |
| files_removed_at | datetime | | | |
| created_at, updated_at | datetime | | | |

## 4. Money

### donations
| Column | Type | Key / null | Default |
|---|---|---|---|
| id | varchar | PK | |
| user_id | varchar | FK users.id (SET NULL) | |
| amount_centavos | INTEGER | NN | |
| status | varchar | NN | 'pending' |
| paymongo_checkout_session_id | varchar | UQ | |
| paymongo_payment_id | varchar | | |
| paid_at | datetime | | |
| created_at, updated_at | datetime | | |

## 5. Parish calendar, settings, messages, audit

### parish_events
| Column | Type | Key / null | Default |
|---|---|---|---|
| id | varchar | PK | |
| title | varchar | NN | |
| date | datetime | NN | |
| duration_minutes | INTEGER | NN | 60 |
| location | varchar | NN | |
| image_url | varchar | | |
| category | varchar | NN | |
| created_by | varchar | FK users.id (SET NULL) | |
| created_at, updated_at | datetime | | |

### blackout_dates
| Column | Type | Key / null | Note |
|---|---|---|---|
| id | INTEGER | PK | |
| date | date | NN | indexed |
| reason | varchar | NN | |
| sacraments | TEXT | | JSON, which sacraments are blocked |
| created_at, updated_at | datetime | | |

### parish_settings (key and value pairs)
| Column | Type | Key / null |
|---|---|---|
| key | varchar | PK |
| value | TEXT | NN |
| created_at, updated_at | datetime | |

### notifications
| Column | Type | Key / null | Default | Note |
|---|---|---|---|---|
| id | varchar | PK | | |
| user_id | varchar | NN, FK users.id (CASCADE) | | |
| booking_id | varchar | FK bookings.id (SET NULL) | | |
| title | varchar | NN | | |
| body | varchar | NN | | |
| category | varchar | NN | | |
| icon | varchar | NN | | |
| read | tinyint(1) | NN | 0 | |
| link | varchar | | | admin-app path |
| created_at, updated_at | datetime | | | |

### audit_logs
| Column | Type | Key / null | Note |
|---|---|---|---|
| id | varchar | PK | |
| actor_user_id | varchar | FK users.id (SET NULL) | |
| action | varchar | NN | |
| subject_type | varchar | NN | polymorphic, **no FK** |
| subject_id | varchar | NN | polymorphic, **no FK** |
| metadata | TEXT | | JSON |
| created_at | datetime | | no `updated_at` |

## Relationships declared in the database (what an ER tool will draw)
users 1 to many: bookings (user_id, created_by, checked_in_by), booking_document_reviews (reviewed_by),
booking_milestones (done_by), booking_notes (author_id), wallet_documents, notification_preferences (one to one),
notifications, donations, certificate_requests (user_id, handled_by), register_entries (revoked_by, entered_by),
parish_events (created_by), audit_logs (actor_user_id).
services 1 to many bookings. bookings 1 to many: booking_document_reviews, booking_milestones, booking_notes,
sent_reminders, notifications; bookings 1 to 0..1 register_entries; register_entries 1 to many certificate_requests.

Not connected by a database FK, so an ER tool shows them as islands: `personal_access_tokens`, `sessions`,
`email_verification_tokens`, `password_reset_tokens`, `register_sequences`, `parish_settings`, `blackout_dates`.
`audit_logs.subject_*` and `personal_access_tokens.tokenable_*` point at other tables by convention only.
