import { describe, expect, it, vi } from 'vitest';

import { createLifecycle } from '../../src/platform/lifecycle.js';

/** Minimal event-target stand-in that records registrations. */
function createTarget() {
  const handlers = new Map();
  return {
    handlers,
    addEventListener(type, handler) {
      handlers.set(type, handler);
    },
    removeEventListener(type) {
      handlers.delete(type);
    },
    emit(type) {
      handlers.get(type)?.();
    },
  };
}

function createHost({ hidden = false } = {}) {
  const windowTarget = createTarget();
  const documentTarget = createTarget();
  documentTarget.hidden = hidden;
  return { windowTarget, documentTarget };
}

describe('createLifecycle', () => {
  it('reports a hidden document', () => {
    const { windowTarget, documentTarget } = createHost({ hidden: true });
    const onHidden = vi.fn();
    const lifecycle = createLifecycle({ host: windowTarget, document: documentTarget });

    lifecycle.start({ onHidden });
    documentTarget.emit('visibilitychange');

    expect(onHidden).toHaveBeenCalledTimes(1);
  });

  it('stays quiet while the document is still visible', () => {
    const { windowTarget, documentTarget } = createHost({ hidden: false });
    const onHidden = vi.fn();
    const lifecycle = createLifecycle({ host: windowTarget, document: documentTarget });

    lifecycle.start({ onHidden });
    documentTarget.emit('visibilitychange');

    expect(onHidden).not.toHaveBeenCalled();
  });

  it('reports a closing page', () => {
    const { windowTarget, documentTarget } = createHost();
    const onUnload = vi.fn();
    const lifecycle = createLifecycle({ host: windowTarget, document: documentTarget });

    lifecycle.start({ onUnload });
    windowTarget.emit('beforeunload');

    expect(onUnload).toHaveBeenCalledTimes(1);
  });

  it('detaches every listener on stop', () => {
    const { windowTarget, documentTarget } = createHost({ hidden: true });
    const onHidden = vi.fn();
    const onUnload = vi.fn();
    const lifecycle = createLifecycle({ host: windowTarget, document: documentTarget });

    lifecycle.start({ onHidden, onUnload });
    lifecycle.stop();
    documentTarget.emit('visibilitychange');
    windowTarget.emit('beforeunload');

    expect(onHidden).not.toHaveBeenCalled();
    expect(onUnload).not.toHaveBeenCalled();
    expect(windowTarget.handlers.size).toBe(0);
    expect(documentTarget.handlers.size).toBe(0);
  });

  it('tolerates a host without event targets', () => {
    const lifecycle = createLifecycle({ host: {}, document: undefined });

    expect(() => lifecycle.start({ onHidden: () => {}, onUnload: () => {} })).not.toThrow();
    expect(() => lifecycle.stop()).not.toThrow();
  });

  it('accepts an empty handler set', () => {
    const { windowTarget, documentTarget } = createHost();
    const lifecycle = createLifecycle({ host: windowTarget, document: documentTarget });

    expect(() => lifecycle.start()).not.toThrow();
  });
});
