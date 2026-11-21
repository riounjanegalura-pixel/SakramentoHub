# Shared booking-validation fixtures

Each `{sacrament}/valid-*.json` must pass BOTH the Laravel rules
(`backend/app/Validation/SacramentRules.php`) and the Zod schemas
(`parishioner/src/features/booking/{sacrament}/definition.tsx`). Each
`invalid-*.json` must fail both, reporting an error at `expectErrorKey`.
`{OWNER}` in document paths is replaced with the booking owner's id by the
test helpers. Add a fixture whenever a rule changes on either side.

`valid-stored-nulls.json` is the shape the server hands back for a saved
booking: Laravel stores a blank optional answer as `null`, so every optional
text field must accept `null` on both sides (a resumed draft or a returned
booking is re-validated from this stored shape).
