import { isAxiosError } from 'axios';
import { type AuthResponse, type Usuario } from '@checkpoint/shared';
import { setAccessToken } from '@/shared/lib/auth-token';
import { queryClient } from '@/shared/lib/query-client';
import { registerSessionHandlers, type RefreshOutcome } from '@/shared/lib/session-handlers';
import { storage } from '@/shared/lib/storage/storage';
import { authApi } from '../api/auth-api';
import { errorCode } from '../lib/auth-errors';
import { SESSAO_ATIVA } from '../lib/session-keys';

/**
 * `carregando`: o boot (refresh) ainda não respondeu. `autenticado`: há sessão. `visitante`: não há
 * (nunca entrou, saiu ou perdeu a sessão). `desconectado`: o boot não chegou a saber (sem rede ou a
 * API falhou): o app mostra a mensagem de sem conexão, NÃO a tela de login.
 */
export type SessionStatus = 'carregando' | 'autenticado' | 'visitante' | 'desconectado';

/**
 * Por que virou visitante: a sessão terminou (mostra o aviso), a pessoa saiu (sem aviso), excluiu a
 * conta (mostra que foi excluída) ou nunca entrou.
 */
export type SessionExit = 'sessao' | 'usuario' | 'conta-excluida' | null;

export interface SessionState {
  status: SessionStatus;
  usuario: Usuario | null;
  saida: SessionExit;
}

/** Entre o `refresh` concorrente (409) e a nova tentativa: a outra aba já gravou o cookie novo. */
const CONCURRENT_RETRY_DELAY_MS = 500;
export const AUTH_CHANNEL = 'checkpoint-auth';

let state: SessionState = { status: 'carregando', usuario: null, saida: null };
const listeners = new Set<() => void>();

function setState(next: Partial<SessionState>): void {
  state = { ...state, ...next };
  for (const listener of [...listeners]) {
    listener();
  }
}

export function getSession(): SessionState {
  return state;
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Só para os testes: volta ao estado de antes do boot. */
export function resetSessionForTests(): void {
  state = { status: 'carregando', usuario: null, saida: null };
  refreshInFlight = null;
  bootInFlight = null;
  setAccessToken(null);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function markAuthenticated(auth: AuthResponse): void {
  setAccessToken(auth.accessToken);
  storage.set(SESSAO_ATIVA, true);
  setState({ status: 'autenticado', usuario: auth.usuario, saida: null });
}

// ---------------------------------------------------------------- renovação (uma por vez)

let refreshInFlight: Promise<RefreshOutcome> | null = null;

function toFailure(error: unknown): RefreshOutcome {
  return isAxiosError(error) && error.response?.status === 401
    ? { kind: 'sessao-encerrada' }
    : { kind: 'falha', error };
}

async function runRefresh(): Promise<RefreshOutcome> {
  try {
    const auth = await authApi.refresh();
    markAuthenticated(auth);
    return { kind: 'ok', usuario: auth.usuario };
  } catch (first) {
    // 409: outra aba renovou no mesmo instante. O cookie novo dela já está no navegador, então UMA
    // nova tentativa (e só uma) deve passar.
    if (errorCode(first) !== 'AUTH_REFRESH_CONCORRENTE') {
      return toFailure(first);
    }
    await delay(CONCURRENT_RETRY_DELAY_MS);
    try {
      const auth = await authApi.refresh();
      markAuthenticated(auth);
      return { kind: 'ok', usuario: auth.usuario };
    } catch (second) {
      return toFailure(second);
    }
  }
}

/**
 * Renova a sessão. Chamadas concorrentes (o boot e três requests com o token vencido, por exemplo)
 * recebem a MESMA promessa: sai exatamente um `POST /auth/refresh`.
 */
export function refreshOnce(): Promise<RefreshOutcome> {
  refreshInFlight ??= runRefresh().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

// ---------------------------------------------------------------- boot

let bootInFlight: Promise<void> | null = null;

/**
 * Recupera a sessão ao carregar a página (o access token só vive em memória): um refresh, ANTES de
 * qualquer query da tela. Uma promessa só, mesmo com o `StrictMode` montando duas vezes.
 */
export function boot(): Promise<void> {
  bootInFlight ??= (async () => {
    const outcome = await refreshOnce();
    if (outcome.kind === 'ok') {
      return;
    }
    if (outcome.kind === 'sessao-encerrada') {
      // Tinha sessão neste navegador e o refresh deu 401: a sessão terminou (mostra o aviso). Se nunca
      // entrou, é só um visitante.
      const tinhaSessao = storage.get(SESSAO_ATIVA);
      setAccessToken(null);
      storage.clearScope('usuario');
      setState({ status: 'visitante', usuario: null, saida: tinhaSessao ? 'sessao' : null });
      return;
    }
    setState({ status: 'desconectado' });
  })().finally(() => {
    bootInFlight = null;
  });
  return bootInFlight;
}

// ---------------------------------------------------------------- entrar e sair

/** Login ou registro concluído: o cache do usuário anterior não pode aparecer nem por um instante. */
export function entrar(auth: AuthResponse): void {
  queryClient.clear();
  markAuthenticated(auth);
}

/**
 * A API devolveu o usuário atualizado (ex.: nome editado no `/perfil`): troca o `usuario` da sessão
 * para toda tela que o lê mudar sem recarregar. Só vale para a MESMA conta autenticada: uma resposta
 * que chega depois de sair (ou de outra conta) é ignorada.
 */
export function atualizarUsuario(usuario: Usuario): void {
  if (state.status === 'autenticado' && state.usuario?.id === usuario.id) {
    setState({ usuario });
  }
}

/** Logout local: nada de token, cache nem preferências do usuário; as chaves `instalacao:*` ficam. */
export function encerrarLocal(saida: Exclude<SessionExit, null>): void {
  setAccessToken(null);
  queryClient.clear();
  storage.clearScope('usuario');
  setState({ status: 'visitante', usuario: null, saida });
}

/**
 * A conta acabou de ser excluída no servidor: logout local já, SEM nenhuma request (o token dela não
 * vale mais, e um 401 depois daqui mostraria "Sua sessão terminou" no lugar do aviso certo). As outras
 * abas recebem o mesmo aviso de logout. Não há cookie para apagar: a própria exclusão já o limpou.
 */
export function encerrarContaExcluida(): void {
  encerrarLocal('conta-excluida');
  postToOtherTabs({ type: 'logout' });
}

export type SairResult = 'ok' | 'sem-conexao' | 'erro';

/**
 * Sair de verdade: o cookie `HttpOnly` só o servidor apaga. Sem conexão o logout NÃO acontece (sair
 * "só localmente" deixaria a sessão voltar no próximo carregamento).
 */
export async function sair(): Promise<SairResult> {
  try {
    await authApi.logout();
  } catch (error) {
    return isAxiosError(error) && !error.response ? 'sem-conexao' : 'erro';
  }
  encerrarLocal('usuario');
  postToOtherTabs({ type: 'logout' });
  return 'ok';
}

// ---------------------------------------------------------------- outras abas

interface AuthMessage {
  type: 'logout';
}

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') {
    return null;
  }
  channel ??= new BroadcastChannel(AUTH_CHANNEL);
  return channel;
}

function postToOtherTabs(message: AuthMessage): void {
  getChannel()?.postMessage(message);
}

/**
 * Escuta o logout de outra aba e faz o logout local aqui, na hora. Sem `BroadcastChannel`, a outra aba
 * descobre na próxima request (401). Devolve a função que desliga.
 */
export function listenToOtherTabs(): () => void {
  const listener = getChannel();
  if (!listener) {
    return () => undefined;
  }
  const onMessage = (event: MessageEvent<AuthMessage>) => {
    if (event.data?.type === 'logout' && state.status === 'autenticado') {
      encerrarLocal('usuario');
    }
  };
  listener.addEventListener('message', onMessage);
  return () => listener.removeEventListener('message', onMessage);
}

// O interceptor do `apiClient` (infra em `shared/`) chama estes dois; o `shared` não importa a feature.
registerSessionHandlers({
  refresh: refreshOnce,
  onSessionEnded: () => {
    // Visitante não "desloga": um 401 sem sessão só é rejeitado.
    if (state.status === 'autenticado') {
      encerrarLocal('sessao');
    }
  },
});
