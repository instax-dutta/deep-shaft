// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { createToast } from '../../src/ui/toast.js';

function mount() {
  document.body.innerHTML = '';
  const toast = createToast({ root: document.body });
  return { toast, message: () => toast.element.textContent.trim() };
}

describe('toast', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('starts empty and hidden', () => {
    const { toast, message } = mount();

    expect(message()).toBe('');
    expect(toast.element.hidden).toBe(true);
  });

  it('shows a message and becomes visible', () => {
    const { toast, message } = mount();

    toast.show('A cave-in disabled a drill.');

    expect(message()).toBe('A cave-in disabled a drill.');
    expect(toast.element.hidden).toBe(false);
  });

  it('announces politely so a penalty is never silent', () => {
    const { toast } = mount();

    expect(toast.element.getAttribute('aria-live')).toBe('polite');
  });

  it('tags the message with a tone the styling can react to', () => {
    const { toast } = mount();

    toast.show('Lucky vein! Production doubled.', { tone: 'good' });

    expect(toast.element.dataset.tone).toBe('good');
  });

  it('defaults to a neutral tone', () => {
    const { toast } = mount();

    toast.show('Welcome back.');

    expect(toast.element.dataset.tone).toBe('neutral');
  });

  it('replaces the previous message', () => {
    const { toast, message } = mount();

    toast.show('First');
    toast.show('Second');

    expect(message()).toBe('Second');
  });

  it('clears back to hidden', () => {
    const { toast, message } = mount();

    toast.show('Something');
    toast.clear();

    expect(message()).toBe('');
    expect(toast.element.hidden).toBe(true);
  });

  it('ignores an empty message', () => {
    const { toast, message } = mount();

    toast.show('');

    expect(message()).toBe('');
    expect(toast.element.hidden).toBe(true);
  });
});
