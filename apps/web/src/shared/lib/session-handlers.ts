import { type Usuario } from '@checkpoint/shared';

/** Como um refresh terminou. `falha` = não chegou a decidir nada sobre a sessão (rede, 5xx, 429). */
export type RefreshOutcome =
  | { kind: 'ok'; usuario: Usuario }
  | { kind: 'sessao-encerrada' }
  | { kind: 'falha'; error: unknown };

export interface SessionHandlers {
  /** Renova a sessão. Uma renovação só por vez: chamadas concorrentes recebem a MESMA promessa. */
  refresh: () => Promise<RefreshOutcome>;
  /** A sessão acabou (401 `AUTH_SESSAO_ENCERRADA` ou refresh recusado): logout local. */
  onSessionEnded: () => void;
}

let handlers: SessionHandlers | null = null;

/**
 * Ponte entre o interceptor do `apiClient` (infra em `shared/`) e a sessão (`features/auth`). O
 * `shared` não importa a feature: quem sabe renovar e deslogar se registra aqui.
 */
export function registerSessionHandlers(next: SessionHandlers | null): void {
  handlers = next;
}

export function getSessionHandlers(): SessionHandlers | null {
  return handlers;
}
