/**
 * ADVERSARIAL tests for physics/forceFields.ts. Expected to FAIL until the implementation is fixed.
 */
import { describe, expect, it } from 'vitest';
import { NEUTRAL_ENV } from './forceFields';

/**
 * `NEUTRAL_ENV` is declared `Readonly<PhysicsEnv>` and built with `Object.freeze`, but both are SHALLOW:
 * `NEUTRAL_ENV.force.x = 1` and `NEUTRAL_ENV.fieldIds.push('x')` compile without error and permanently
 * corrupt module-global state for every later reader, in a package whose whole premise is determinism
 * (CLAUDE.md, ARCHITECTURE.md "regla de oro"). `DEFAULT_TUNING` is frozen for exactly this reason
 * (§11.6 "un único objeto congelado"); the neutral environment deserves the same treatment.
 *
 * The existing test only checks that `sampleForceFields` does not HAND OUT the shared object — it does
 * not stop any other consumer of the public barrel (`index.ts` re-exports NEUTRAL_ENV) from writing to it.
 */
describe('NEUTRAL_ENV — deep immutability (determinism, §11.6)', () => {
  it('the shared force vector cannot be written through', () => {
    expect(Object.isFrozen(NEUTRAL_ENV.force)).toBe(true);
  });

  it('the shared fieldIds array cannot be appended to', () => {
    expect(Object.isFrozen(NEUTRAL_ENV.fieldIds)).toBe(true);
  });
});
