/**
 * "prefers-reduced-motion", read live so a change in the system settings applies straight away. It asks
 * less of the eye: no camera movement, fewer particles, a slower sea. Sound and the rule-bearing tells stay.
 */
let query: MediaQueryList | null | undefined;

export function reducedMotion(): boolean {
  if (query === undefined) {
    try {
      query = globalThis.matchMedia('(prefers-reduced-motion: reduce)');
    } catch {
      query = null;
    }
  }
  return query?.matches ?? false;
}
