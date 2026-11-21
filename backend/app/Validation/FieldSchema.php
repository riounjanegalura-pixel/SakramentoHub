<?php

namespace App\Validation;

/**
 * Describes the form a sacrament asks for (field, kind, choices, required) by reading SacramentRules itself,
 * so the office's walk-in form can never ask for something the server will not accept, or miss something it needs.
 * Labels are made from the key names; better wording can be added later.
 */
final class FieldSchema
{
    /** Asked by the walk-in contact section instead of as ordinary fields. */
    private const HANDLED_ELSEWHERE = ['bookingFor', 'relationship', 'relationshipOther', 'alternatePhone'];

    /** @return array{fields: list<array<string, mixed>>, sponsors: ?array<string, mixed>, documents: list<array<string, mixed>>} */
    public static function for(string $sacrament): array
    {
        $fields = [];
        $sponsorFields = [];
        $sponsors = null;

        foreach (SacramentRules::contentRules($sacrament) as $key => $rules) {
            $rules = is_array($rules) ? $rules : [$rules];

            if ($key === 'sponsors') {
                $sponsors = ['min' => 0, 'max' => 0];
                foreach ($rules as $r) {
                    if (is_string($r) && preg_match('/^(min|max):(\d+)$/', $r, $m)) {
                        $sponsors[$m[1]] = (int) $m[2];
                    }
                }
                continue;
            }
            if (str_starts_with($key, 'sponsors.*.')) {
                $name = substr($key, 11);
                if (! str_ends_with($name, 'Code') && $name !== 'residenceLine') {
                    $sponsorFields[] = self::field($name, $rules);
                }
                continue;
            }
            if (in_array($key, self::HANDLED_ELSEWHERE, true) || str_ends_with($key, 'Code')) {
                continue;
            }
            $fields[] = self::field($key, $rules);
        }

        if ($sponsors !== null) {
            $sponsors['fields'] = $sponsorFields;
        }

        return [
            'fields' => $fields,
            'sponsors' => $sponsors,
            'documents' => array_map(
                fn (array $d) => ['key' => $d['key'], 'label' => $d['label'], 'requirement' => $d['requirement'], 'condition' => $d['condition']],
                SacramentDocuments::catalogue($sacrament),
            ),
        ];
    }

    /** @param list<mixed> $rules */
    private static function field(string $key, array $rules): array
    {
        $text = array_map(fn ($r) => is_scalar($r) || $r instanceof \Stringable ? (string) $r : '', $rules);
        $type = 'text';
        $options = null;

        foreach ($text as $r) {
            if (str_starts_with($r, 'in:')) {
                $type = 'select';
                $options = array_values(array_filter(str_getcsv(substr($r, 3), ',', '"', '')));
            } elseif ($r === 'boolean') {
                $type = 'yesno';
            } elseif ($r === 'integer') {
                $type = 'number';
            } elseif (str_starts_with($r, 'date_format:Y-m-d')) {
                $type = 'date';
            }
        }
        // A sex or civil status written as a list of two or more words reads best as a select; a boolean as yes/no.
        $label = ucfirst(strtolower(trim(preg_replace('/(?<!^)([A-Z])/', ' $1', $key))));
        $label = str_replace([' of birth', 'Place of'], [' of birth', 'Place of'], $label);

        return array_filter([
            'key' => $key,
            'label' => $label,
            'type' => $type,
            'options' => $options,
            'required' => in_array('required', $text, true),
        ], fn ($v) => $v !== null);
    }
}
