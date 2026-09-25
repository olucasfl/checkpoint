import { useEffect } from 'react';
import { useAuth } from '@/features/auth/session/use-auth';
import { definirUsuario } from '@/shared/lib/prefs/prefs-store';

/**
 * Liga as preferências do aparelho ao usuário da sessão: quando ela resolve, passam a valer as de
 * quem entrou (e não mais as de quem usou por último). Fica no app porque junta `auth` e `shared`.
 */
export function PrefsSync() {
  const { status, usuario } = useAuth();
  const userId = status === 'autenticado' ? (usuario?.id ?? null) : null;

  useEffect(() => {
    // `carregando` e `desconectado` não dizem quem é: nada muda até a sessão resolver.
    if (status === 'autenticado' || status === 'visitante') {
      definirUsuario(userId);
    }
  }, [status, userId]);

  return null;
}
