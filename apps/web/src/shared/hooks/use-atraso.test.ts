import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAtraso } from './use-atraso';

describe('useAtraso (CA-23)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('só vira true depois de 300 ms contínuos ativo', () => {
    const { result } = renderHook(() => useAtraso(true, 300));

    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(true);
  });

  it('se termina antes, nunca vira true (carregamento rápido não anima)', () => {
    const { result, rerender } = renderHook(({ ativo }) => useAtraso(ativo, 300), {
      initialProps: { ativo: true },
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ ativo: false });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current).toBe(false);
  });

  it('volta a false quando o ativo cai e recomeça a contagem', () => {
    const { result, rerender } = renderHook(({ ativo }) => useAtraso(ativo, 300), {
      initialProps: { ativo: true },
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe(true);

    rerender({ ativo: false });
    expect(result.current).toBe(false);
    rerender({ ativo: true });
    expect(result.current).toBe(false);
  });
});
