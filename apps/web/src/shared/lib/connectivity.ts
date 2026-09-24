import { queryClient } from './query-client';

/**
 * `offline`: o navegador diz que não há rede. `sem-servidor`: há rede, mas a API não responde.
 * Os dois pedem o mesmo cuidado (nada foi salvo), mas o texto do aviso é outro.
 */
export type ConnectionState = 'online' | 'offline' | 'sem-servidor';

/** Espera antes de cada nova sondagem; o último degrau se repete até a conexão voltar. */
export const PROBE_DELAYS_MS = [5_000, 10_000, 20_000, 30_000] as const;

export interface ConnectivityDeps {
  /** Refaz as consultas ao voltar a ficar online (o que o usuário viu pode estar velho). */
  invalidate: () => void;
  isBrowserOnline: () => boolean;
  isTabVisible: () => boolean;
}

/** Resolve se a API respondeu QUALQUER coisa (até 500); rejeita se não houve resposta. */
export type Probe = () => Promise<unknown>;

export interface Connectivity {
  getState(): ConnectionState;
  subscribe(listener: () => void): () => void;
  /** A API respondeu (qualquer status HTTP): há conexão e servidor. */
  reportReachable(): void;
  /** Uma chamada terminou sem resposta (rede caiu, servidor fora do ar, tempo esgotado). */
  reportUnreachable(): void;
  /** Sonda agora, sem esperar o próximo degrau ("Tentar agora"). */
  retryNow(): void;
  setProbe(probe: Probe): void;
  /** Liga os eventos do navegador; devolve a função que desliga. */
  start(): () => void;
}

/**
 * Fábrica à parte do singleton para os testes injetarem relógio falso e dependências. Não importa
 * o `apiClient` (é ele quem registra a sondagem e alimenta este módulo), para não haver ciclo.
 */
export function createConnectivity(deps: ConnectivityDeps): Connectivity {
  const listeners = new Set<() => void>();
  let state: ConnectionState = 'online';
  let probe: Probe = () => Promise.reject(new Error('sondagem não registrada'));
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;
  let inFlight = false;
  /** Cada "voltou" invalida as sondagens em andamento: uma falha tardia não derruba o online. */
  let reachableEpoch = 0;

  function setState(next: ConnectionState): void {
    if (next === state) {
      return;
    }
    state = next;
    for (const listener of [...listeners]) {
      listener();
    }
  }

  function failureState(): ConnectionState {
    return deps.isBrowserOnline() ? 'sem-servidor' : 'offline';
  }

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function scheduleNext(): void {
    if (timer !== null || state === 'online') {
      return;
    }
    const tier = Math.min(attempt, PROBE_DELAYS_MS.length - 1);
    const isLastTier = tier === PROBE_DELAYS_MS.length - 1;
    attempt += 1;
    timer = setTimeout(() => {
      timer = null;
      // Aba escondida não gasta bateria e rede a cada 30 s; ao voltar a ficar visível, sonda na hora.
      if (isLastTier && !deps.isTabVisible()) {
        attempt -= 1;
        scheduleNext();
        return;
      }
      void runProbe();
    }, PROBE_DELAYS_MS[tier]);
  }

  async function runProbe(): Promise<void> {
    if (inFlight) {
      return;
    }
    inFlight = true;
    const epoch = reachableEpoch;
    try {
      await probe();
      if (epoch === reachableEpoch) {
        reportReachable();
      }
    } catch {
      if (epoch === reachableEpoch && state !== 'online') {
        setState(failureState());
        scheduleNext();
      }
    } finally {
      inFlight = false;
    }
  }

  function reportReachable(): void {
    reachableEpoch += 1;
    clearTimer();
    attempt = 0;
    if (state === 'online') {
      return;
    }
    setState('online');
    deps.invalidate();
  }

  function reportUnreachable(): void {
    setState(failureState());
    scheduleNext();
  }

  function retryNow(): void {
    if (state === 'online') {
      return;
    }
    clearTimer();
    void runProbe();
  }

  return {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    reportReachable,
    reportUnreachable,
    retryNow,

    setProbe(next) {
      probe = next;
    },

    start() {
      const onOffline = () => {
        setState('offline');
        scheduleNext();
      };
      const onOnline = () => {
        // O navegador acha que voltou; só a API confirma.
        if (state === 'offline') {
          setState('sem-servidor');
        }
        retryNow();
      };
      const onVisibility = () => {
        if (deps.isTabVisible()) {
          retryNow();
        }
      };

      window.addEventListener('offline', onOffline);
      window.addEventListener('online', onOnline);
      document.addEventListener('visibilitychange', onVisibility);

      if (!deps.isBrowserOnline()) {
        onOffline();
      }

      return () => {
        window.removeEventListener('offline', onOffline);
        window.removeEventListener('online', onOnline);
        document.removeEventListener('visibilitychange', onVisibility);
        clearTimer();
      };
    },
  };
}

export const connectivity: Connectivity = createConnectivity({
  invalidate: () => {
    void queryClient.invalidateQueries();
  },
  isBrowserOnline: () => navigator.onLine,
  isTabVisible: () => document.visibilityState === 'visible',
});
