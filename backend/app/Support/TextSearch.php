<?php

namespace App\Support;

use Illuminate\Contracts\Database\Query\Builder;

/**
 * Case-insensitive matching that also works for Ñ and accented letters on SQLite.
 *
 * SQLite's LOWER() folds only A–Z, so "LOWER(name) LIKE 'ñiguez%'" never matches a stored
 * "Ñiguez". The term is therefore tried in the cases people actually type or store — as typed,
 * lower, UPPER and Title — with LOWER() on both sides for the plain letters. MySQL's collation
 * already ignores case; there the extra variants are harmless.
 */
final class TextSearch
{
    /** @return list<string> */
    public static function variants(string $term): array
    {
        return array_values(array_unique([
            $term,
            mb_strtolower($term),
            mb_strtoupper($term),
            mb_convert_case($term, MB_CASE_TITLE),
        ]));
    }

    /**
     * OR-group: the column (a column name or SQL expression written by us, never user input) contains the term.
     * The escape character is "!", as in StoredDocuments: a backslash is itself an escape in MySQL string literals,
     * so ESCAPE '\' is a syntax error there.
     */
    public static function orContains(Builder $query, string $columnSql, string $term): void
    {
        foreach (self::variants($term) as $variant) {
            $query->orWhereRaw("LOWER({$columnSql}) LIKE LOWER(?) ESCAPE '!'", ['%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $variant).'%']);
        }
    }

    /** The column equals the term, ignoring case. */
    public static function whereEquals(Builder $query, string $columnSql, string $term): void
    {
        $query->where(function ($q) use ($columnSql, $term) {
            foreach (self::variants($term) as $variant) {
                $q->orWhereRaw("LOWER({$columnSql}) = LOWER(?)", [$variant]);
            }
        });
    }
}
