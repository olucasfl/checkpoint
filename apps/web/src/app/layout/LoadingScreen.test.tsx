import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ATRASO_DO_CHEK_MS, LoadingScreen } from './LoadingScreen';

describe('LoadingScreen (CA-25, CA-26)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('mostra o Chek parado e o status "Carregando"; a bandeira só balança depois de 300 ms', () => {
    const { container } = render(<LoadingScreen />);

    expect(screen.getByRole('status', { name: 'Carregando' })).toBeInTheDocument();
    expect(container.querySelector('svg[data-chek="feliz"]')).not.toBeNull();
    expect(container.querySelector('.chek-bandeira')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(ATRASO_DO_CHEK_MS - 1);
    });
    expect(container.querySelector('.chek-bandeira')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.querySelector('.chek-bandeira')).not.toBeNull();
  });

  it('um boot rápido (a tela sai antes de 300 ms) nunca aplica o balanço', () => {
    const { container, unmount } = render(<LoadingScreen />);

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(container.querySelector('.chek-bandeira')).toBeNull();
    unmount();
  });
});
