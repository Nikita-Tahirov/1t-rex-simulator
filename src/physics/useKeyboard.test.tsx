import { render } from '@testing-library/react';
import { type RefObject, useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { type KeyboardState, useKeyboard } from './useKeyboard.ts';

function KeyboardProbe({ onReady }: { onReady: (ref: RefObject<KeyboardState>) => void }) {
  const keyboard = useKeyboard();
  useEffect(() => {
    onReady(keyboard);
  }, [keyboard, onReady]);
  return null;
}

function press(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, code }));
}

function release(code: string): void {
  window.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, code }));
}

function renderKeyboardProbe() {
  let latestKeys: RefObject<KeyboardState> | null = null;
  const view = render(<KeyboardProbe onReady={(ref) => (latestKeys = ref)} />);
  const keys = (): KeyboardState => {
    if (!latestKeys) throw new Error('KeyboardProbe is not mounted');
    return latestKeys.current;
  };
  return { keys, view };
}

describe('useKeyboard', () => {
  it('maps KeyD keydown/keyup to right steering', () => {
    const { keys, view } = renderKeyboardProbe();

    press('KeyD');
    expect(keys().right).toBe(true);

    release('KeyD');
    expect(keys().right).toBe(false);
    view.unmount();
  });

  it('maps ArrowRight to right steering', () => {
    const { keys, view } = renderKeyboardProbe();

    press('ArrowRight');

    expect(keys().right).toBe(true);
    view.unmount();
  });

  it('lets the latest horizontal steering key win over stale opposite state', () => {
    const { keys, view } = renderKeyboardProbe();

    press('KeyA');
    press('KeyD');

    expect(keys().left).toBe(false);
    expect(keys().right).toBe(true);
    view.unmount();
  });

  it('clears pressed keys when the window loses focus', () => {
    const { keys, view } = renderKeyboardProbe();

    press('KeyD');
    window.dispatchEvent(new Event('blur'));

    expect(keys().right).toBe(false);
    view.unmount();
  });
});
