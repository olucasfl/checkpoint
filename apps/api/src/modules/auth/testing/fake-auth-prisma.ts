import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

/**
 * Prisma falso, em memória, só com o que o módulo `auth` usa (`user`, `refreshSession` e `tokenDeUsoUnico`). Existe para
 * testar o fluxo ponta a ponta (registro → login → refresh → logout) sem tocar o Postgres real
 * (RULES.md §5). Implementa só as formas de `where`/`select` que o código de produção usa.
 */

export interface UserRow {
  id: string;
  nome: string;
  email: string;
  senhaHash: string;
  emailVerificadoEm: Date | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface TokenRow {
  id: string;
  userId: string;
  tipo: 'VERIFICACAO_EMAIL' | 'RESET_SENHA';
  tokenHash: string;
  criadoEm: Date;
  expiraEm: Date;
  usadoEm: Date | null;
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
  id?: string | { in: string[] } | { not: string };
  email?: string;
  userId?: string;
  tokenHash?: string;
  tipo?: string;
  usadoEm?: Date | null;
  emailVerificadoEm?: Date | null;
  expiraEm?: { lt: Date } | { gt: Date };
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
      if ('not' in condition) {
        return value !== condition.not;
      }
      if ('lt' in condition) {
        return (value as Date).getTime() < (condition.lt as Date).getTime();
      }
      if ('gt' in condition) {
        return (value as Date).getTime() > (condition.gt as Date).getTime();
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

/** Só o que a exclusão de conta lê dos jogos: o dono e o caminho da capa. */
export interface GameCapaRow {
  userId: string;
  capaPath: string | null;
}

/** Só o dono: a exclusão de conta não lê nada da camada da plataforma, só precisa que ela suma junto. */
export interface DonoRow {
  userId: string;
}

export class FakeAuthPrisma {
  users: UserRow[] = [];
  sessions: SessionRow[] = [];
  tokens: TokenRow[] = [];
  games: GameCapaRow[] = [];
  /** `ContaVinculada` e `JogoPlataforma` (spec `integracao-plataformas`): vão junto com o usuário, por cascade. */
  contasVinculadas: DonoRow[] = [];
  jogosPlataforma: DonoRow[] = [];

  /**
   * Duas formas, como o Prisma: array (as operações já foram disparadas; basta esperar todas) e callback
   * (recebe este mesmo objeto como `tx`). Nenhuma tem rollback: é teste.
   */
  $transaction = jest.fn(
    async (
      arg: Promise<unknown>[] | ((tx: FakeAuthPrisma) => Promise<unknown>),
    ): Promise<unknown> => (typeof arg === 'function' ? arg(this) : Promise.all(arg)),
  );

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
        const row: UserRow = {
          id: randomUUID(),
          emailVerificadoEm: null,
          criadoEm: now,
          atualizadoEm: now,
          ...args.data,
        };
        this.users.push(row);
        return project(row, args.select);
      },
    ),
    update: jest.fn(
      async (args: {
        where: { id: string };
        data: Partial<Pick<UserRow, 'nome' | 'senhaHash'>>;
        select?: Record<string, boolean>;
      }): Promise<unknown> => {
        const row = this.users.find((user) => user.id === args.where.id);
        if (!row) {
          throw new Prisma.PrismaClientKnownRequestError('Record not found', {
            code: 'P2025',
            clientVersion: 'teste',
          });
        }
        Object.assign(row, args.data, { atualizadoEm: new Date() });
        return project(row, args.select);
      },
    ),
    updateMany: jest.fn(
      async (args: { where: Where; data: Partial<UserRow> }): Promise<{ count: number }> => {
        const rows = this.users.filter((user) => matches({ ...user }, args.where));
        rows.forEach((row) => Object.assign(row, args.data, { atualizadoEm: new Date() }));
        return { count: rows.length };
      },
    ),
    /**
     * Com o `onDelete: Cascade` do schema: as sessões, os jogos e a camada das plataformas (`ContaVinculada` e
     * `JogoPlataforma`) do usuário vão junto.
     */
    delete: jest.fn(
      async (args: {
        where: { id: string };
        select?: Record<string, boolean>;
      }): Promise<unknown> => {
        const row = this.users.find((user) => user.id === args.where.id);
        if (!row) {
          throw new Prisma.PrismaClientKnownRequestError('Record not found', {
            code: 'P2025',
            clientVersion: 'teste',
          });
        }
        this.users = this.users.filter((user) => user !== row);
        this.tokens = this.tokens.filter((token) => token.userId !== row.id);
        this.sessions = this.sessions.filter((session) => session.userId !== row.id);
        this.games = this.games.filter((game) => game.userId !== row.id);
        this.contasVinculadas = this.contasVinculadas.filter((conta) => conta.userId !== row.id);
        this.jogosPlataforma = this.jogosPlataforma.filter((jogo) => jogo.userId !== row.id);
        return project(row, args.select);
      },
    ),
  };

  tokenDeUsoUnico = {
    create: jest.fn(
      async (args: {
        data: Pick<TokenRow, 'userId' | 'tipo' | 'tokenHash' | 'expiraEm'>;
      }): Promise<TokenRow> => {
        const row: TokenRow = {
          id: randomUUID(),
          criadoEm: new Date(),
          usadoEm: null,
          ...args.data,
        };
        this.tokens.push(row);
        return row;
      },
    ),
    /** `select: { user: { select } }` é a única relação que o código de produção pede. */
    findFirst: jest.fn(
      async (args: {
        where: Where;
        select?: Record<string, boolean | { select: Record<string, boolean> }>;
      }): Promise<unknown> => {
        const row = this.tokens.find((token) => matches({ ...token }, args.where));
        if (!row) {
          return null;
        }
        const out: Record<string, unknown> = {};
        for (const [key, wanted] of Object.entries(args.select ?? { id: true })) {
          if (key === 'user' && typeof wanted === 'object') {
            const owner = this.users.find((user) => user.id === row.userId);
            out.user = owner ? project(owner, wanted.select) : null;
          } else if (wanted) {
            out[key] = (row as unknown as Record<string, unknown>)[key];
          }
        }
        return out;
      },
    ),
    updateMany: jest.fn(
      async (args: { where: Where; data: Partial<TokenRow> }): Promise<{ count: number }> => {
        const rows = this.tokens.filter((token) => matches({ ...token }, args.where));
        rows.forEach((row) => Object.assign(row, args.data));
        return { count: rows.length };
      },
    ),
  };

  game = {
    findMany: jest.fn(
      async (args: {
        where: { userId: string; capaPath?: { not: null } };
        select?: Record<string, boolean>;
      }): Promise<unknown[]> =>
        this.games
          .filter((game) => game.userId === args.where.userId)
          .filter((game) => !args.where.capaPath || game.capaPath !== null)
          .map((game) => project(game, args.select)),
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
