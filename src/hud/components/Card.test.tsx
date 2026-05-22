import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { Card } from './Card.tsx';

describe('Card disclosure behavior', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('toggles titled card content with disclosure semantics', () => {
    render(<Card title="Скорость">payload</Card>);

    const toggle = screen.getByRole('button', { name: 'Свернуть Скорость' });
    const contentId = toggle.getAttribute('aria-controls');
    const content = contentId ? document.getElementById(contentId) : null;
    expect(content).not.toBeNull();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(content).toContainElement(screen.getByText('payload'));
    expect(screen.getByText('payload')).toBeVisible();

    fireEvent.click(toggle);

    expect(screen.getByRole('button', { name: 'Развернуть Скорость' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByText('payload')).not.toBeVisible();
  });

  it('persists collapsed state by storage key', () => {
    const first = render(
      <Card title="Миссия" storageKey="mission">
        scenario controls
      </Card>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Свернуть Миссия' }));
    first.unmount();

    render(
      <Card title="Миссия" storageKey="mission">
        scenario controls
      </Card>,
    );

    expect(screen.getByRole('button', { name: 'Развернуть Миссия' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getByText('scenario controls')).not.toBeVisible();
  });
});
