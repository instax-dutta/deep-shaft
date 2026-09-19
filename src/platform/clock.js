/**
 * Wall-clock provider.
 *
 * Core gameplay receives elapsed seconds and never reads the clock itself; this adapter is the
 * single place that does, so tests can inject their own time source.
 */

export function createClock(readNow = () => Date.now()) {
  return {
    /** Current wall-clock time in milliseconds. */
    now: () => readNow(),
  };
}
