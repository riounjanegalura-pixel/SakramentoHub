<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Single source of truth for User::role
    |--------------------------------------------------------------------------
    |
    | `role` is a plain string column (see the 2026_09_01_005623 migration's
    | own comment — deliberately matches Booking::status's convention: no DB
    | enum, validated in the application layer). Every place that needs to
    | know "what roles exist" or "what an admin may assign" reads from here
    | instead of repeating the same three string literals — Admin\UserController,
    | its form requests, and any future caller.
    |
    */

    // Every role this app recognizes, full stop.
    'all' => ['parishioner', 'staff', 'admin'],

    // Roles POST /admin/users may create. Deliberately excludes 'parishioner'
    // — self-registration (POST /register) is the only path to that role;
    // this endpoint exists specifically to provision staff/admin accounts,
    // the one thing that previously had no endpoint or UI at all.
    'admin_creatable' => ['admin'],

    // Roles an admin may give an existing account. The parish has parishioners and admins only (client decision,
    // 2026-10): 'staff' stays in `all` so an old account still reads as itself, but nothing can create or assign it.
    'assignable' => ['parishioner', 'admin'],

    // Roles that work the parish office side (receive staff notifications,
    // may act on any booking). Same members as admin_creatable today, but a
    // different question — kept separate so one can change without the other.
    'staff_side' => ['staff', 'admin'],

];
