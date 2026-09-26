import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AVISO_MIN_MS, avisar, duracaoDoAviso } from '@/shared/lib/avisos';
import { Avisos, SAIDA_DO_AVISO_MS } from './Avisos';

const regiao = () => screen.getByRole('status');

describe('Avisos (CA-41 a CA-46)', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('a região viva existe vazia e o aviso entra depois, sem roubar o foco', () => {
    render(
      <>
        <button type="button">Antes</button>
        <Avisos />
      </>,
    );
    screen.getByRole('button', { name: 'Antes' }).focus();
    expect(regiao()).toBeEmptyDOMElement();

    act(() => avisar({ texto: 'Jogo adicionado.' }));

    expect(regiao()).toHaveTextContent('Jogo adicionado.');
    expect(regiao()).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('button', { name: 'Antes' })).toHaveFocus();
  });

  it('fica pelo menos 4 s, sai com animação e some sozinho', () => {
    render(<Avisos />);
    act(() => avisar({ texto: 'Jogo adicionado.' }));

    act(() => {
      vi.advanceTimersByTime(AVISO_MIN_MS - 1);
    });
    expect(regiao()).toHaveTextContent('Jogo adicionado.');
    expect(document.querySelector('[data-aviso]')).toHaveClass('aviso-in');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(document.querySelector('[data-aviso]')).toHaveClass('aviso-out');
    act(() => {
      vi.advanceTimersByTime(SAIDA_DO_AVISO_MS);
    });
    expect(regiao()).toBeEmptyDOMElement();
  });

  it('texto longo fica mais tempo: 1 s por 20 caracteres acima de 60', () => {
    expect(duracaoDoAviso('curto')).toBe(4_000);
    expect(duracaoDoAviso('a'.repeat(60))).toBe(4_000);
    expect(duracaoDoAviso('a'.repeat(61))).toBe(5_000);
    expect(duracaoDoAviso('a'.repeat(120))).toBe(7_000);
  });

  it('o tempo pausa com o mouse em cima e recomeça ao sair', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Avisos />);
    act(() => avisar({ texto: 'Nome atualizado.' }));
    const aviso = () => document.querySelector('[data-aviso]') as HTMLElement;

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    await user.hover(aviso());
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(aviso()).toHaveClass('aviso-in');

    await user.unhover(aviso());
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(aviso()).toHaveClass('aviso-out');
  });

  it('Fechar tira o aviso na hora (com a saída) e o próximo da fila entra depois', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Avisos />);
    act(() => {
      avisar({ texto: 'Primeiro.' });
      avisar({ texto: 'Segundo.' });
    });
    expect(regiao()).toHaveTextContent('Primeiro.');
    expect(regiao()).not.toHaveTextContent('Segundo.');

    await user.click(screen.getByRole('button', { name: 'Fechar aviso' }));
    act(() => {
      vi.advanceTimersByTime(SAIDA_DO_AVISO_MS);
    });

    expect(regiao()).toHaveTextContent('Segundo.');
  });

  it('com o Chek comemorando, o Chek aparece no lugar do check', () => {
    render(<Avisos />);
    act(() => avisar({ texto: 'Primeiro jogo!', chek: 'comemorando' }));

    expect(document.querySelector('svg[data-chek="comemorando"]')).not.toBeNull();
    expect(document.querySelector('.check-pop')).toBeNull();
  });

  it('a ação do aviso chama o callback e fecha o aviso', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const aoClicar = vi.fn();
    render(<Avisos />);
    act(() => avisar({ texto: 'Adicionado em Jogando.', acao: { rotulo: 'Ver', aoClicar } }));

    await user.click(screen.getByRole('button', { name: 'Ver' }));

    expect(aoClicar).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-aviso]')).toHaveClass('aviso-out');
  });
});
