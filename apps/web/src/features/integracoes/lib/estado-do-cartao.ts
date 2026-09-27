import { isAxiosError } from 'axios';
import { errorCode } from '@/features/auth/lib/auth-errors';

/** Por que o cartão não tem dados: o que a pessoa vê e o que ela pode fazer muda em cada caso. */
export type FalhaDoCartao = 'privado' | 'reautenticar' | 'sem-conexao' | 'erro';

export function classificarFalhaDoCartao(error: unknown): FalhaDoCartao {
  if (isAxiosError(error) && !error.response) {
    return 'sem-conexao';
  }
  const code = errorCode(error);
  if (code === 'PLATAFORMA_REAUTENTICAR') {
    return 'reautenticar';
  }
  return code === 'PLATAFORMA_PERFIL_PRIVADO' ? 'privado' : 'erro';
}
