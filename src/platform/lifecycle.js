/**
 * Browser lifecycle wiring.
 *
 * Registers the visibility and unload listeners that flush a save, and always exposes a
 * `stop` that removes every listener it added — no orphaned handlers on rebuild or teardown.
 */

export function createLifecycle({ host = globalThis, document: doc } = {}) {
  const documentTarget = doc ?? host?.document;
  const removers = [];

  function listen(target, type, handler) {
    if (!target || typeof target.addEventListener !== 'function') {
      return;
    }
    target.addEventListener(type, handler);
    removers.push(() => target.removeEventListener(type, handler));
  }

  return {
    /**
     * Starts listening. `onHidden` fires when the tab is backgrounded (the moment a mobile
     * browser is most likely to discard the page), `onUnload` when the page closes.
     */
    start({ onHidden, onUnload } = {}) {
      if (onHidden) {
        listen(documentTarget, 'visibilitychange', () => {
          if (documentTarget?.hidden) {
            onHidden();
          }
        });
      }
      if (onUnload) {
        listen(host, 'beforeunload', onUnload);
      }
      return () => this.stop();
    },

    stop() {
      while (removers.length > 0) {
        removers.pop()();
      }
    },
  };
}
