import { isAxiosError } from 'axios';
import { errorCode } from '@/features/auth/lib/auth-errors';

/** Por que o cartão não tem dados: o que a pessoa vê e o que ela pode fazer muda em cada caso. */
export type FalhaDoCartao = 'privado' | 'sem-conexao' | 'erro';

export function classificarFalhaDoCartao(error: unknown): FalhaDoCartao {
  if (isAxiosError(error) && !error.response) {
    return 'sem-conexao';
  }
  return errorCode(error) === 'PLATAFORMA_PERFIL_PRIVADO' ? 'privado' : 'erro';
}
