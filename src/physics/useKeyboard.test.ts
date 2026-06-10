import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { isEditableTarget, useKeyboard } from './useKeyboard.ts';

function dispatchKey(target: EventTarget, type: 'keydown' | 'keyup', code: string): KeyboardEvent {
  const event = new KeyboardEvent(type, { code, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe('useKeyboard — ввод в текстовых полях не управляет роботом', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('keydown на window управляет и гасится preventDefault', () => {
    const { result, unmount } = renderHook(() => useKeyboard());
    const event = dispatchKey(window, 'keydown', 'KeyW');
    expect(result.current.current.forward).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    dispatchKey(window, 'keyup', 'KeyW');
    expect(result.current.current.forward).toBe(false);
    unmount();
  });

  it('keydown в <input> игнорируется и НЕ гасится (русские буквы ц/ф/ы/в… вводятся)', () => {
    const { result, unmount } = renderHook(() => useKeyboard());
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    // KeyW — физический код буквы «ц» в русской раскладке
    const event = dispatchKey(input, 'keydown', 'KeyW');
    expect(result.current.current.forward).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    unmount();
  });

  it('клавиша, зажатая до фокуса в поле, отпускается и в поле (нет залипания)', () => {
    const { result, unmount } = renderHook(() => useKeyboard());
    dispatchKey(window, 'keydown', 'KeyW');
    expect(result.current.current.forward).toBe(true);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    dispatchKey(input, 'keyup', 'KeyW');
    expect(result.current.current.forward).toBe(false);
    unmount();
  });
});

describe('isEditableTarget', () => {
  it('распознаёт input/textarea/select/contentEditable, отвергает прочее', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableTarget(document.createElement('select'))).toBe(true);
    const div = document.createElement('div');
    expect(isEditableTarget(div)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(window)).toBe(false);
  });
});
