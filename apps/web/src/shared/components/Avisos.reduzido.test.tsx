import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AVISO_MIN_MS, avisar } from '@/shared/lib/avisos';
import { Avisos } from './Avisos';

vi.mock('@/shared/hooks/use-movimento-reduzido', () => ({ useMovimentoReduzido: () => true }));

describe('Avisos com movimento reduzido (CA-46, CA-57, CA-58)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('some de uma vez no fim do tempo: o mesmo tempo na tela, sem esperar a saída', () => {
    render(<Avisos />);
    act(() => avisar({ texto: 'Jogo adicionado.' }));

    act(() => {
      vi.advanceTimersByTime(AVISO_MIN_MS - 1);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Jogo adicionado.');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    // Sem animação de saída, o aviso sai no primeiro tick depois do tempo (sem esperar SAIDA_DO_AVISO_MS).
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('duas comemorações não se acumulam: a segunda espera a primeira sair, e o Chek fica estático', () => {
    render(<Avisos />);
    act(() => {
      avisar({ texto: 'Primeiro jogo!', chek: 'comemorando' });
      avisar({ texto: 'Zerado!', chek: 'comemorando' });
    });

    expect(screen.getByRole('status')).toHaveTextContent('Primeiro jogo!');
    expect(screen.getByRole('status')).not.toHaveTextContent('Zerado!');
    expect(document.querySelectorAll('svg[data-chek="comemorando"]')).toHaveLength(1);
    expect(document.querySelector('.chek-bandeira')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(AVISO_MIN_MS);
    });
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Zerado!');
  });
});
