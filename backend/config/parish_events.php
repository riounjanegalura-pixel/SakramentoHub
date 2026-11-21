<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Single source of truth for ParishEvent::category
    |--------------------------------------------------------------------------
    |
    | Deliberately its own list rather than reusing config('booking.slot_capacity')'s
    | keys: that config only covers the sacraments a *booking* can be made
    | for, and is missing categories a parish event legitimately needs
    | ('mass', 'general') that aren't bookable sacraments at all — see
    | ParishEventSeeder's existing 'mass' category, predating this feature.
    | Reusing it would either drop those categories or force unrelated
    | booking config to grow entries it doesn't need. This is the one place
    | both Create/UpdateParishEventRequest validate `category` against, so
    | the list is never duplicated.
    |
    */
    // Events only (client decision, 2026-10): a baptism, wedding and the other services are bookings, and a booking
    // reaches the calendar and locks its slot when it is submitted, so they are not entered here by hand.
    'categories' => [
        'mass',
        'feast',
        'seminar',
        'fundraiser',
        'community',
        'notice',
        'general',
        'other',
    ],

];
