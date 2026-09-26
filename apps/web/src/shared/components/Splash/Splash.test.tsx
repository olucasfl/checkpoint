import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reiniciarAberturaParaTeste } from './abertura';
import { Splash, TEMPO } from './Splash';

const originalMatchMedia = window.matchMedia;

/** `consultas` são as media queries que "valem" neste teste; as outras não. */
function definirMatchMedia(consultas: string[]) {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn((query: string) => ({
      matches: consultas.includes(query),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
    configurable: true,
    writable: true,
  });
}

function irPara(url: string) {
  window.history.replaceState(null, '', url);
}

/** Em passos curtos, com o React renderizando entre eles: um timer agendado por um efeito só existe depois disso. */
async function avancar(ms: number) {
  for (let feito = 0; feito < ms; feito += 50) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(Math.min(50, ms - feito));
    });
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  reiniciarAberturaParaTeste();
  irPara('/');
  document.body.innerHTML = '<div id="root"></div>';
  definirMatchMedia([]);
});

afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(window, 'matchMedia', {
    value: originalMatchMedia,
    configurable: true,
    writable: true,
  });
});

describe('abertura do PWA (splash)', () => {
  it('numa aba comum do navegador não aparece', async () => {
    render(<Splash />);
    await avancar(TEMPO.sai + TEMPO.saida);

    expect(document.querySelector('[data-splash]')).toBeNull();
  });

  it('com ?splash=1 aparece, avisa leitor de tela e trava o app atrás; some sozinha e devolve o app', async () => {
    irPara('/?splash=1');
    render(<Splash />);
    await avancar(10);

    expect(screen.getByRole('status')).toHaveTextContent('Abrindo o Checkpoint');
    expect(document.getElementById('root')).toHaveAttribute('inert');
    expect(document.querySelectorAll('[data-glifo]')).toHaveLength(8);
    expect(document.querySelectorAll('.splash-pino')).toHaveLength(6);

    await avancar(TEMPO.sai + TEMPO.saida + 200);

    expect(document.querySelector('[data-splash]')).toBeNull();
    expect(document.getElementById('root')).not.toHaveAttribute('inert');
  });

  it('o Chek dorme e acorda no meio da abertura', async () => {
    irPara('/?splash=1');
    render(<Splash />);
    await avancar(10);

    expect(document.querySelector('svg[data-chek="dormindo"]')).not.toBeNull();

    await avancar(TEMPO.acorda);

    expect(document.querySelector('svg[data-chek="feliz"]')).not.toBeNull();
    expect(document.querySelector('svg[data-chek="dormindo"]')).toBeNull();
  });

  it('no app instalado aparece uma vez por abertura (recarregar não repete)', async () => {
    definirMatchMedia(['(display-mode: standalone)']);
    const primeira = render(<Splash />);
    await avancar(10);

    expect(document.querySelector('[data-splash]')).not.toBeNull();

    primeira.unmount();
    render(<Splash />);
    await avancar(10);

    expect(document.querySelector('[data-splash]')).toBeNull();
  });

  it('um toque a encerra, mas só depois de uma fração de segundo (não some por um toque sem querer)', async () => {
    irPara('/?splash=1');
    render(<Splash />);
    await avancar(10);
    const tela = document.querySelector('[data-splash]') as HTMLElement;

    fireEvent.click(tela);
    await avancar(TEMPO.saida + 10);
    expect(document.querySelector('[data-splash]')).not.toBeNull();

    await avancar(TEMPO.pularDepoisDe);
    fireEvent.click(tela);
    expect(tela).toHaveClass('splash-saindo');
    await avancar(TEMPO.saida + 10);

    expect(document.querySelector('[data-splash]')).toBeNull();
  });

  it('com movimento reduzido: o Chek já acordado e a tela some em menos de 1,5 s', async () => {
    irPara('/?splash=1');
    definirMatchMedia(['(prefers-reduced-motion: reduce)']);
    render(<Splash />);
    await avancar(10);

    expect(document.querySelector('svg[data-chek="feliz"]')).not.toBeNull();
    expect(document.querySelector('svg[data-chek="dormindo"]')).toBeNull();

    await avancar(TEMPO.saiReduzido + 200);

    expect(document.querySelector('[data-splash]')).toBeNull();
    expect(TEMPO.saiReduzido).toBeLessThan(1500);
  });

  it('a decoração é escondida do leitor de tela: só o aviso "Abrindo o Checkpoint" é lido', async () => {
    irPara('/?splash=1');
    render(<Splash />);
    await avancar(10);

    const tela = document.querySelector('[data-splash]') as HTMLElement;
    const lidos = [...tela.children].filter(
      (filho) => filho.getAttribute('aria-hidden') !== 'true',
    );

    expect(lidos).toHaveLength(1);
    expect(lidos[0]).toHaveClass('sr-only');
  });
});
