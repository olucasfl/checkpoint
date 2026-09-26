import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DIAS_DE_USO, DISPENSADO_EM, INSTALADO } from '@/shared/lib/pwa/install-keys';
import { type BeforeInstallPromptEvent } from '@/shared/lib/pwa/install-prompt';
import { setUpdatePromptVisivel } from '@/shared/lib/pwa/update-prompt-visibility';
import { storage } from '@/shared/lib/storage/storage';
import { InstallNudge, DISMISS_QUIET_MS, NUDGE_DELAY_MS } from './InstallNudge';

const NOW = new Date(2026, 8, 24, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const CHROME_TEXT = 'Instale o Checkpoint para abrir direto da tela inicial, em tela cheia.';
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const originalUserAgent = navigator.userAgent;
const originalMatchMedia = window.matchMedia;

function nativeEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn(() => Promise.resolve());
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome, platform: 'web' }) });
  return { event: event as BeforeInstallPromptEvent, prompt };
}

/** O Chrome guardou o convite nativo. */
function chromeCanInstall(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const fake = nativeEvent(outcome);
  act(() => {
    window.dispatchEvent(fake.event);
  });
  return fake;
}

function setMatchMedia(value: unknown) {
  Object.defineProperty(window, 'matchMedia', { value, configurable: true, writable: true });
}

function standalone(on: boolean) {
  setMatchMedia(
    vi.fn((query: string) => ({ matches: on && query === '(display-mode: standalone)' })),
  );
}

function useIphoneSafari() {
  Object.defineProperty(navigator, 'userAgent', { value: IPHONE_SAFARI, configurable: true });
}

function usedOn(total: number) {
  storage.set(DIAS_DE_USO, { ultimoDia: '2026-09-24', total });
}

function renderAt(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <InstallNudge />
    </MemoryRouter>,
  );
}

async function elapse(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const region = () => screen.getByRole('status');
const shown = () => region().textContent !== '';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  standalone(false);
  usedOn(2);
});

afterEach(() => {
  act(() => {
    // `appinstalled` descarta o evento guardado; depois as chaves saem.
    window.dispatchEvent(new Event('appinstalled'));
    setUpdatePromptVisivel(false);
  });
  storage.clearScope('dispositivo');
  document.querySelectorAll('dialog').forEach((dialog) => dialog.remove());
  Object.defineProperty(navigator, 'userAgent', { value: originalUserAgent, configurable: true });
  setMatchMedia(originalMatchMedia);
  vi.useRealTimers();
});

describe('InstallNudge no Chrome/Edge', () => {
  it('todas as condições valem: aparece só depois de 4 s, com o texto da spec', async () => {
    chromeCanInstall();
    renderAt();

    await elapse(NUDGE_DELAY_MS - 1);
    expect(shown()).toBe(false);

    await elapse(1);
    expect(region()).toHaveTextContent(CHROME_TEXT);
    expect(screen.getByRole('button', { name: 'Instalar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agora não' })).toBeInTheDocument();
    expect(region()).toHaveAttribute('aria-live', 'polite');
  });

  it('a região viva existe sempre, vazia sem convite', () => {
    renderAt();

    expect(region()).toBeEmptyDOMElement();
  });

  it('o convite nativo que chega DEPOIS do render também faz aparecer', async () => {
    renderAt();
    await elapse(NUDGE_DELAY_MS + 100);
    expect(shown()).toBe(false);

    chromeCanInstall();

    expect(region()).toHaveTextContent(CHROME_TEXT);
  });

  it('os botões têm alvo de pelo menos 44 px (min-h-11)', async () => {
    chromeCanInstall();
    renderAt();
    await elapse(NUDGE_DELAY_MS);

    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveClass('min-h-11');
    }
  });
});

describe('cada condição, isolada, impede o convite', () => {
  async function expectHidden(setup?: () => void, path = '/') {
    chromeCanInstall();
    setup?.();
    renderAt(path);
    await elapse(NUDGE_DELAY_MS + 500);
    expect(shown()).toBe(false);
  }

  it('já aberto como app instalado (standalone)', () => expectHidden(() => standalone(true)));

  it('instalacao:instalado verdadeiro', () => expectHidden(() => storage.set(INSTALADO, true)));

  it('aberto em menos de 2 dias (total 1)', () => expectHidden(() => usedOn(1)));

  it('nunca contou dia de uso (total 0)', () => expectHidden(() => usedOn(0)));

  it('dispensado há 13 dias', () =>
    expectHidden(() => storage.set(DISPENSADO_EM, NOW.getTime() - 13 * DAY)));

  it('rota /login', () => expectHidden(undefined, '/login'));

  it('rota /registro', () => expectHidden(undefined, '/registro'));

  it('um <dialog open> no documento', () =>
    expectHidden(() => {
      const dialog = document.createElement('dialog');
      dialog.setAttribute('open', '');
      document.body.append(dialog);
    }));

  it('o UpdatePrompt está visível (a atualização tem prioridade)', () =>
    expectHidden(() => act(() => setUpdatePromptVisivel(true))));

  it('sem convite nativo e fora do Safari do iOS (nada a oferecer)', async () => {
    renderAt();
    await elapse(NUDGE_DELAY_MS + 500);

    expect(shown()).toBe(false);
  });
});

describe('condições que liberam o convite', () => {
  it('dispensado há 15 dias → aparece de novo', async () => {
    chromeCanInstall();
    storage.set(DISPENSADO_EM, NOW.getTime() - 15 * DAY);
    renderAt();

    await elapse(NUDGE_DELAY_MS);

    expect(region()).toHaveTextContent(CHROME_TEXT);
  });

  it('dispensado há exatamente 14 dias → aparece (o limite é "há ≥ 14 dias")', async () => {
    chromeCanInstall();
    storage.set(DISPENSADO_EM, NOW.getTime() - DISMISS_QUIET_MS);
    renderAt();

    await elapse(NUDGE_DELAY_MS);

    expect(shown()).toBe(true);
  });

  it('o diálogo fecha → o convite aparece', async () => {
    chromeCanInstall();
    const dialog = document.createElement('dialog');
    dialog.setAttribute('open', '');
    document.body.append(dialog);
    renderAt();
    await elapse(NUDGE_DELAY_MS + 500);
    expect(shown()).toBe(false);

    await act(async () => {
      dialog.removeAttribute('open');
    });

    expect(region()).toHaveTextContent(CHROME_TEXT);
  });

  it('o aviso de versão nova some → o convite aparece', async () => {
    chromeCanInstall();
    act(() => setUpdatePromptVisivel(true));
    renderAt();
    await elapse(NUDGE_DELAY_MS + 500);
    expect(shown()).toBe(false);

    act(() => setUpdatePromptVisivel(false));

    expect(shown()).toBe(true);
  });
});

describe('ações do convite', () => {
  it('"Agora não" grava dispensado-em = agora e some', async () => {
    chromeCanInstall();
    renderAt();
    await elapse(NUDGE_DELAY_MS);

    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));

    expect(storage.get(DISPENSADO_EM)).toBe(NOW.getTime() + NUDGE_DELAY_MS);
    expect(shown()).toBe(false);
  });

  it('depois do "Agora não", um novo carregamento não mostra o convite (dispensado há 0 dias)', async () => {
    chromeCanInstall();
    const first = renderAt();
    await elapse(NUDGE_DELAY_MS);
    fireEvent.click(screen.getByRole('button', { name: 'Agora não' }));
    first.unmount();

    chromeCanInstall();
    renderAt();
    await elapse(NUDGE_DELAY_MS + 500);

    expect(shown()).toBe(false);
  });

  it('"Instalar" abre o prompt nativo; aceito → some e não volta', async () => {
    const { prompt } = chromeCanInstall('accepted');
    renderAt();
    await elapse(NUDGE_DELAY_MS);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Instalar' }));
    });

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(shown()).toBe(false);
    expect(storage.get(DISPENSADO_EM)).toBeNull();
    await elapse(60_000);
    expect(shown()).toBe(false);
  });

  it('"Instalar" com o prompt nativo recusado → grava dispensado-em e some', async () => {
    chromeCanInstall('dismissed');
    renderAt();
    await elapse(NUDGE_DELAY_MS);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Instalar' }));
    });

    expect(storage.get(DISPENSADO_EM)).toBe(NOW.getTime() + NUDGE_DELAY_MS);
    expect(shown()).toBe(false);
  });

  it('o evento appinstalled com o convite na tela → some e não volta', async () => {
    chromeCanInstall();
    renderAt();
    await elapse(NUDGE_DELAY_MS);
    expect(shown()).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(shown()).toBe(false);
    expect(storage.get(INSTALADO)).toBe(true);
  });
});

describe('InstallNudge no Safari do iOS', () => {
  it('passo a passo com o ícone Compartilhar (aria-hidden) e "Entendi", sem "Instalar"', async () => {
    useIphoneSafari();
    renderAt();

    await elapse(NUDGE_DELAY_MS);

    expect(region()).toHaveTextContent(
      'Para instalar: toque em Compartilhar (ícone ios_share) e depois em Adicionar à Tela de Início.',
    );
    const share = [...region().querySelectorAll('.icon')].find((icon) =>
      icon.textContent?.includes('ios_share'),
    );
    expect(share).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Entendi' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Instalar' })).not.toBeInTheDocument();
  });

  it('"Entendi" grava dispensado-em e some', async () => {
    useIphoneSafari();
    renderAt();
    await elapse(NUDGE_DELAY_MS);

    fireEvent.click(screen.getByRole('button', { name: 'Entendi' }));

    expect(storage.get(DISPENSADO_EM)).toBe(NOW.getTime() + NUDGE_DELAY_MS);
    expect(shown()).toBe(false);
  });

  it('as mesmas condições valem no iOS (total 1 → não aparece)', async () => {
    useIphoneSafari();
    usedOn(1);
    renderAt();

    await elapse(NUDGE_DELAY_MS + 500);

    expect(shown()).toBe(false);
  });
});

describe('animação', () => {
  it('usa o cartão com entrada animada, desligada pela regra global de movimento reduzido', async () => {
    chromeCanInstall();
    renderAt();
    await elapse(NUDGE_DELAY_MS);

    expect(region().querySelector('.update-in')).not.toBeNull();
  });
});
