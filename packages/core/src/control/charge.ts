/**
 * Compatibility surface for the module that used to own the charge curve.
 *
 * DECISIONS-v1.2 D2 turned power into pull DISTANCE, so the rule moved to `control/pull.ts` with it.
 * Level content, the validator and the content tests import `zoneRadius` / `impulseMagnitude` from
 * here by that path, and none of them care where the number is computed: re-exporting keeps one
 * implementation without a rename sweep through files owned by other parts of the project.
 */
export * from './pull';
