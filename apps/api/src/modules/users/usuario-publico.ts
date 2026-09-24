import { Prisma } from '@prisma/client';
import { type Usuario } from '@checkpoint/shared';

/**
 * Lista branca do que sai do banco sobre o usuário: NUNCA o registro inteiro, para `senhaHash` não
 * poder vazar por um `select` esquecido. Usada por `auth` (registro, login, refresh, me) e por
 * `users` (editar o nome): uma definição só.
 */
export const USUARIO_PUBLICO_SELECT = {
  id: true,
  nome: true,
  email: true,
  criadoEm: true,
} as const satisfies Prisma.UserSelect;

export type UsuarioRow = Prisma.UserGetPayload<{ select: typeof USUARIO_PUBLICO_SELECT }>;

export function toUsuario(row: UsuarioRow): Usuario {
  return { id: row.id, nome: row.nome, email: row.email, criadoEm: row.criadoEm.toISOString() };
}
