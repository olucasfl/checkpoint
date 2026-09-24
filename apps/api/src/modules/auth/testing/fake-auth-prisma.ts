import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

/**
 * Prisma falso, em memória, só com o que o módulo `auth` usa (`user` e `refreshSession`). Existe para
 * testar o fluxo ponta a ponta (registro → login → refresh → logout) sem tocar o Postgres real
 * (RULES.md §5). Implementa só as formas de `where`/`select` que o código de produção usa.
 */

export interface UserRow {
  id: string;
  nome: string;
  email: string;
  senhaHash: string;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface SessionRow {
  id: string;
  userId: string;
  tokenHash: string;
  hashAnterior: string | null;
  rotacionadoEm: Date | null;
  dispositivo: string;
  criadoEm: Date;
  ultimoUsoEm: Date;
  expiraEm: Date;
}

type Where = {
  id?: string | { in: string[] };
  email?: string;
  userId?: string;
  tokenHash?: string;
  expiraEm?: { lt: Date };
};

function matches(row: Record<string, unknown>, where: Where | undefined): boolean {
  if (!where) {
    return true;
  }
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];
    if (condition !== null && typeof condition === 'object') {
      if ('in' in condition) {
        return (condition.in as unknown[]).includes(value);
      }
      if ('lt' in condition) {
        return (value as Date).getTime() < (condition.lt as Date).getTime();
      }
    }
    return value === condition;
  });
}

/** Aplica o `select`: sem ele devolve a linha inteira, como o Prisma. */
function project<T extends object>(row: T, select?: Record<string, boolean>): Partial<T> {
  if (!select) {
    return { ...row };
  }
  return Object.fromEntries(
    Object.entries(select)
      .filter(([, wanted]) => wanted)
      .map(([key]) => [key, (row as Record<string, unknown>)[key]]),
  ) as Partial<T>;
}

export function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'teste',
  });
}

export class FakeAuthPrisma {
  users: UserRow[] = [];
  sessions: SessionRow[] = [];

  user = {
    findUnique: jest.fn(
      async (args: { where: Where; select?: Record<string, boolean> }): Promise<unknown> => {
        const row = this.users.find((user) => matches({ ...user }, args.where));
        return row ? project(row, args.select) : null;
      },
    ),
    create: jest.fn(
      async (args: {
        data: Pick<UserRow, 'nome' | 'email' | 'senhaHash'>;
        select?: Record<string, boolean>;
      }): Promise<unknown> => {
        if (this.users.some((user) => user.email === args.data.email)) {
          throw uniqueViolation();
        }
        const now = new Date();
        const row: UserRow = { id: randomUUID(), criadoEm: now, atualizadoEm: now, ...args.data };
        this.users.push(row);
        return project(row, args.select);
      },
    ),
  };

  refreshSession = {
    findUnique: jest.fn(
      async (args: { where: Where; select?: Record<string, boolean> }): Promise<unknown> => {
        const row = this.sessions.find((session) => matches({ ...session }, args.where));
        return row ? project(row, args.select) : null;
      },
    ),
    findMany: jest.fn(
      async (args: {
        where: Where;
        orderBy?: { ultimoUsoEm: 'asc' | 'desc' };
        select?: Record<string, boolean>;
      }): Promise<unknown[]> => {
        const rows = this.sessions.filter((session) => matches({ ...session }, args.where));
        if (args.orderBy) {
          const sign = args.orderBy.ultimoUsoEm === 'asc' ? 1 : -1;
          rows.sort((a, b) => sign * (a.ultimoUsoEm.getTime() - b.ultimoUsoEm.getTime()));
        }
        return rows.map((row) => project(row, args.select));
      },
    ),
    create: jest.fn(
      async (args: {
        data: Partial<SessionRow> &
          Pick<SessionRow, 'id' | 'userId' | 'tokenHash' | 'dispositivo' | 'expiraEm'>;
      }): Promise<SessionRow> => {
        const now = new Date();
        const row: SessionRow = {
          hashAnterior: null,
          rotacionadoEm: null,
          criadoEm: now,
          ultimoUsoEm: now,
          ...args.data,
        };
        this.sessions.push(row);
        return row;
      },
    ),
    updateMany: jest.fn(
      async (args: { where: Where; data: Partial<SessionRow> }): Promise<{ count: number }> => {
        const rows = this.sessions.filter((session) => matches({ ...session }, args.where));
        rows.forEach((row) => Object.assign(row, args.data));
        return { count: rows.length };
      },
    ),
    deleteMany: jest.fn(async (args: { where: Where }): Promise<{ count: number }> => {
      const before = this.sessions.length;
      this.sessions = this.sessions.filter((session) => !matches({ ...session }, args.where));
      return { count: before - this.sessions.length };
    }),
  };
}

/** Hasher falso e instantâneo: o scrypt real (128 MiB por hash) só é testado no spec dele. */
export const fakeHasher = {
  hash: jest.fn(async (senha: string) => `fake$${senha}`),
  verify: jest.fn(async (hash: string, senha: string) => hash === `fake$${senha}`),
};
