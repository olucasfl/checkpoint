import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConnectivity, PROBE_DELAYS_MS, type ConnectivityDeps } from './connectivity';

interface Env {
  browserOnline: boolean;
  tabVisible: boolean;
}

function setup(initial: Partial<Env> = {}) {
  const env: Env = { browserOnline: true, tabVisible: true, ...initial };
  const invalidate = vi.fn();
  const deps: ConnectivityDeps = {
    invalidate,
    isBrowserOnline: () => env.browserOnline,
    isTabVisible: () => env.tabVisible,
  };
  const connectivity = createConnectivity(deps);
  const probe = vi.fn<() => Promise<unknown>>(() => Promise.reject(new Error('sem resposta')));
  connectivity.setProbe(probe);
  return { connectivity, env, invalidate, probe };
}

/** Avança o relógio e deixa as promessas da sondagem resolverem. */
async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('transições de estado', () => {
  it('começa online', () => {
    expect(setup().connectivity.getState()).toBe('online');
  });

  it('chamada sem resposta com o navegador online → sem-servidor', () => {
    const { connectivity } = setup();

    connectivity.reportUnreachable();

    expect(connectivity.getState()).toBe('sem-servidor');
  });

  it('chamada sem resposta com navigator.onLine falso → offline', () => {
    const { connectivity } = setup({ browserOnline: false });

    connectivity.reportUnreachable();

    expect(connectivity.getState()).toBe('offline');
  });

  it('resposta HTTP → online, e invalida as consultas UMA vez', () => {
    const { connectivity, invalidate } = setup();
    connectivity.reportUnreachable();

    connectivity.reportReachable();
    connectivity.reportReachable();

    expect(connectivity.getState()).toBe('online');
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('online → online não invalida nada', () => {
    const { connectivity, invalidate } = setup();

    connectivity.reportReachable();

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('avisa os assinantes só quando o estado muda, e para de avisar após cancelar', () => {
    const { connectivity } = setup();
    const listener = vi.fn();
    const unsubscribe = connectivity.subscribe(listener);

    connectivity.reportUnreachable();
    connectivity.reportUnreachable();
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    connectivity.reportReachable();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('eventos do navegador (start)', () => {
  it('evento offline → offline; evento online sonda e, com resposta, volta a online', async () => {
    const { connectivity, probe, invalidate } = setup();
    const stop = connectivity.start();

    window.dispatchEvent(new Event('offline'));
    expect(connectivity.getState()).toBe('offline');

    probe.mockResolvedValue({});
    window.dispatchEvent(new Event('online'));
    await advance(0);

    expect(probe).toHaveBeenCalledTimes(1);
    expect(connectivity.getState()).toBe('online');
    expect(invalidate).toHaveBeenCalledTimes(1);
    stop();
  });

  it('evento online, mas a API não responde → sem-servidor (o navegador não é a palavra final)', async () => {
    const { connectivity } = setup();
    const stop = connectivity.start();
    window.dispatchEvent(new Event('offline'));

    window.dispatchEvent(new Event('online'));
    await advance(0);

    expect(connectivity.getState()).toBe('sem-servidor');
    stop();
  });

  it('já começa offline se o navegador diz que está offline', () => {
    const { connectivity } = setup({ browserOnline: false });
    const stop = connectivity.start();

    expect(connectivity.getState()).toBe('offline');
    stop();
  });

  it('aba voltando a ficar visível sonda na hora, se não está online', async () => {
    const { connectivity, probe } = setup();
    const stop = connectivity.start();
    connectivity.reportUnreachable();

    document.dispatchEvent(new Event('visibilitychange'));
    await advance(0);

    expect(probe).toHaveBeenCalledTimes(1);
    stop();
  });

  it('visibilitychange estando online não sonda', async () => {
    const { connectivity, probe } = setup();
    const stop = connectivity.start();

    document.dispatchEvent(new Event('visibilitychange'));
    await advance(0);

    expect(probe).not.toHaveBeenCalled();
    stop();
  });

  it('depois de stop(), os eventos não têm mais efeito e o agendamento para', async () => {
    const { connectivity, probe } = setup();
    const stop = connectivity.start();
    connectivity.reportUnreachable();
    stop();

    window.dispatchEvent(new Event('offline'));
    await advance(60_000);

    expect(connectivity.getState()).toBe('sem-servidor');
    expect(probe).not.toHaveBeenCalled();
  });
});

describe('sondagem com espera crescente', () => {
  it('sonda em 5, 10, 20 s e depois a cada 30 s', async () => {
    const { connectivity, probe } = setup();
    connectivity.reportUnreachable();
    expect(PROBE_DELAYS_MS).toEqual([5_000, 10_000, 20_000, 30_000]);

    await advance(4_999);
    expect(probe).toHaveBeenCalledTimes(0);
    await advance(1);
    expect(probe).toHaveBeenCalledTimes(1);

    await advance(9_999);
    expect(probe).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(probe).toHaveBeenCalledTimes(2);

    await advance(20_000);
    expect(probe).toHaveBeenCalledTimes(3);

    await advance(30_000);
    expect(probe).toHaveBeenCalledTimes(4);
    await advance(30_000);
    expect(probe).toHaveBeenCalledTimes(5);
  });

  it('a sondagem que responde leva a online e o agendamento para', async () => {
    const { connectivity, probe, invalidate } = setup();
    connectivity.reportUnreachable();
    probe.mockResolvedValue({});

    await advance(5_000);

    expect(connectivity.getState()).toBe('online');
    expect(invalidate).toHaveBeenCalledTimes(1);
    await advance(120_000);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('depois de voltar e cair de novo, a espera recomeça em 5 s', async () => {
    const { connectivity, probe } = setup();
    connectivity.reportUnreachable();
    await advance(5_000);
    await advance(10_000);
    expect(probe).toHaveBeenCalledTimes(2);

    connectivity.reportReachable();
    connectivity.reportUnreachable();
    probe.mockClear();
    await advance(5_000);

    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('no degrau de 30 s a aba escondida NÃO sonda; ao ficar visível, sonda na hora', async () => {
    const { connectivity, env, probe } = setup();
    const stop = connectivity.start();
    connectivity.reportUnreachable();
    await advance(5_000 + 10_000 + 20_000);
    expect(probe).toHaveBeenCalledTimes(3);

    env.tabVisible = false;
    await advance(90_000);
    expect(probe).toHaveBeenCalledTimes(3);

    env.tabVisible = true;
    document.dispatchEvent(new Event('visibilitychange'));
    await advance(0);
    expect(probe).toHaveBeenCalledTimes(4);
    stop();
  });

  it('"Tentar agora" sonda sem esperar o degrau e não duplica a que já está em andamento', async () => {
    const { connectivity, probe } = setup();
    connectivity.reportUnreachable();

    connectivity.retryNow();
    connectivity.retryNow();
    await advance(0);

    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('"Tentar agora" com sucesso vai a online', async () => {
    const { connectivity, probe } = setup();
    connectivity.reportUnreachable();
    probe.mockResolvedValue({});

    connectivity.retryNow();
    await advance(0);

    expect(connectivity.getState()).toBe('online');
  });

  it('sondagem que falha depois de a API já ter respondido não derruba o online', async () => {
    const { connectivity, probe } = setup();
    connectivity.reportUnreachable();
    let rejectProbe: (reason: Error) => void = () => undefined;
    probe.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectProbe = reject;
        }),
    );

    connectivity.retryNow();
    connectivity.reportReachable();
    rejectProbe(new Error('tarde demais'));
    await advance(0);

    expect(connectivity.getState()).toBe('online');
    await advance(60_000);
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('sem sondagem registrada, falha sem lançar e segue tentando', async () => {
    const connectivity = createConnectivity({
      invalidate: vi.fn(),
      isBrowserOnline: () => true,
      isTabVisible: () => true,
    });
    connectivity.reportUnreachable();

    await advance(5_000);

    expect(connectivity.getState()).toBe('sem-servidor');
  });
});
