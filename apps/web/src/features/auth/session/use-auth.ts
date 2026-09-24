import { useSyncExternalStore } from 'react';
import {
  atualizarUsuario,
  boot,
  entrar,
  getSession,
  sair,
  subscribeSession,
  type SessionState,
} from './session';

export interface UseAuth extends SessionState {
  entrar: typeof entrar;
  sair: typeof sair;
  /** Troca o `usuario` da sessão pelo que a API devolveu (nome editado no perfil). */
  atualizarUsuario: typeof atualizarUsuario;
  /** Refaz o boot (botão "Tentar de novo" quando o app está `desconectado`). */
  recarregar: () => Promise<void>;
}

/** O estado da sessão e as ações, de um store externo: todos os componentes leem o mesmo valor. */
export function useAuth(): UseAuth {
  const state = useSyncExternalStore(subscribeSession, getSession);
  return { ...state, entrar, sair, atualizarUsuario, recarregar: boot };
}
