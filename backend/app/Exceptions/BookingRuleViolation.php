<?php

namespace App\Exceptions;

/** A business rule refused the action; the message is shown to the user verbatim. */
class BookingRuleViolation extends \RuntimeException {}
