<?php

namespace App\Services\PayMongo;

use RuntimeException;

/** Any failure talking to the PayMongo API (network, 4xx/5xx, malformed response). */
class PayMongoException extends RuntimeException
{
}
