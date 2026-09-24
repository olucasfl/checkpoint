import { type INestApplication } from '@nestjs/common';
import { Prisma, type Game as GameRow } from '@prisma/client';
import { ANA_ID, BIA_ID, startGamesApp } from './testing/games-http-app';

/**
 * Sobe o módulo de verdade (controller + pipe global + guard global + service) numa porta local
 * efêmera e fala HTTP com ele por `fetch`. PrismaService e StorageService são objetos simples de
 * funções: nenhum teste toca o banco nem o Supabase reais. Cobre o que o teste de service não vê:
 * código de status, corpo, o pipe e o guard ligados, e a leitura real do multipart.
 */
const ID = '3f2b8a52-9c1e-4d6a-8f31-0a7e5b2c9d44';
const DUPLICATE = 'Já existe esse jogo nesta plataforma';
const RATING = 'Nota só pode ser preenchida quando o status é Zerado ou Jogando';

const game = {
  findMany: jest.fn(),
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

const storage = {
  upload: jest.fn(),
  remove: jest.fn(),
  publicUrl: jest.fn(),
};

function row(overrides: Partial<GameRow> = {}): GameRow {
  return {
    id: ID,
    userId: ANA_ID,
    titulo: 'Hollow Knight',
    plataforma: '',
    status: 'JOGANDO',
    nota: null,
    capaPath: null,
    tituloNormalizado: 'hollow knight',
    plataformaNormalizada: '',
    criadoEm: new Date('2026-09-23T12:00:00.000Z'),
    atualizadoEm: new Date('2026-09-23T12:00:00.000Z'),
    ...overrides,
  };
}

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('erro simulado', {
    code,
    clientVersion: 'teste',
  });
}

let app: INestApplication;
let baseUrl: string;
let anaToken: string;
let biaToken: string;

interface CallOptions {
  /** `null` = sem cabeçalho Authorization. Padrão: o token da Ana. */
  token?: string | null;
  body?: unknown;
  form?: FormData;
}

async function call(method: string, path: string, options: CallOptions = {}) {
  const token = options.token === undefined ? anaToken : options.token;
  const headers: Record<string, string> = {};
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: options.form ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
  });
  const text = await response.text();
  return { status: response.status, text, json: text ? (JSON.parse(text) as unknown) : undefined };
}

function pngForm(): FormData {
  const form = new FormData();
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  form.append('arquivo', new Blob([png], { type: 'image/png' }), 'capa.png');
  return form;
}

beforeAll(async () => {
  const started = await startGamesApp(game, storage);
  app = started.app;
  baseUrl = started.baseUrl;
  anaToken = await started.tokenFor(ANA_ID);
  biaToken = await started.tokenFor(BIA_ID);
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  [...Object.values(game), ...Object.values(storage)].forEach((fn) => fn.mockReset());
  storage.publicUrl.mockImplementation((path: string) => `https://storage.teste/capas/${path}`);
});

describe('GET /api/games', () => {
  it('200 com a lista no shape do contrato, sem as colunas normalizadas (CA-05)', async () => {
    game.findMany.mockResolvedValue([row()]);

    const { status, json } = await call('GET', '/games');

    expect(status).toBe(200);
    expect(json).toEqual([
      {
        id: ID,
        titulo: 'Hollow Knight',
        plataforma: null,
        status: 'JOGANDO',
        nota: null,
        capaUrl: null,
        criadoEm: '2026-09-23T12:00:00.000Z',
        atualizadoEm: '2026-09-23T12:00:00.000Z',
      },
    ]);
  });

  it('filtra pelo dono do token (CA-42)', async () => {
    game.findMany.mockResolvedValue([]);

    await call('GET', '/games');
    await call('GET', '/games', { token: biaToken });

    expect(game.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { userId: ANA_ID } }),
    );
    expect(game.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { userId: BIA_ID } }),
    );
  });

  it('repassa ?status= ao filtro, junto do dono (CA-06)', async () => {
    game.findMany.mockResolvedValue([]);

    const { status, json } = await call('GET', '/games?status=JOGANDO');

    expect(status).toBe(200);
    expect(json).toEqual([]);
    expect(game.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: ANA_ID, status: 'JOGANDO' } }),
    );
  });

  it('400 com fields.status para status inválido no filtro (CA-20)', async () => {
    const { status, json } = await call('GET', '/games?status=PAUSADO');

    expect(status).toBe(400);
    expect(json).toMatchObject({ statusCode: 400, fields: { status: expect.any(String) } });
    expect(game.findMany).not.toHaveBeenCalled();
  });
});

describe('POST /api/games', () => {
  it('201 com o jogo criado, gravado com o dono do token e sem userId na resposta (CA-01, CA-46)', async () => {
    game.findFirst.mockResolvedValue(null);
    game.create.mockResolvedValue(row());

    const { status, json } = await call('POST', '/games', {
      body: { titulo: 'Hollow Knight', status: 'JOGANDO' },
    });

    expect(status).toBe(201);
    expect(json).toMatchObject({ id: ID, plataforma: null, nota: null });
    expect(json).not.toHaveProperty('userId');
    expect(game.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: ANA_ID }),
    });
  });

  it('400 para userId no corpo, e nada é criado (CA-46)', async () => {
    const { status, json } = await call('POST', '/games', {
      body: { titulo: 'Celeste', status: 'ZERADO', userId: BIA_ID },
    });

    expect(status).toBe(400);
    expect(json).toMatchObject({ message: expect.stringContaining('userId') });
    expect(game.findFirst).not.toHaveBeenCalled();
    expect(game.create).not.toHaveBeenCalled();
  });

  it.each([
    ['titulo vazio (CA-13)', { titulo: '', status: 'JOGANDO' }, 'titulo'],
    ['status inválido (CA-15)', { titulo: 'X', status: 'PAUSADO' }, 'status'],
    ['nota 11 (CA-16)', { titulo: 'X', status: 'ZERADO', nota: 11 }, 'nota'],
  ])('400 com o campo apontado em fields: %s', async (_nome, body, campo) => {
    const { status, json } = await call('POST', '/games', { body });

    expect(status).toBe(400);
    expect(json).toMatchObject({ statusCode: 400, fields: { [campo]: expect.any(String) } });
    expect(game.create).not.toHaveBeenCalled();
  });

  it('400 para campo não declarado (CA-18)', async () => {
    const { status, json } = await call('POST', '/games', {
      body: { titulo: 'X', status: 'JOGANDO', cor: 'azul' },
    });

    expect(status).toBe(400);
    expect(json).toMatchObject({ message: expect.stringContaining('cor') });
  });

  it('400 com fields.nota quando a nota vem com QUERO_JOGAR, e nada é criado (CA-19)', async () => {
    const { status, json } = await call('POST', '/games', {
      body: { titulo: 'Hades', status: 'QUERO_JOGAR', nota: 8 },
    });

    expect(status).toBe(400);
    expect(json).toEqual({ statusCode: 400, message: RATING, fields: { nota: RATING } });
    expect(game.create).not.toHaveBeenCalled();
  });

  it('409 com a mensagem literal em fields.titulo quando já existe (CA-30)', async () => {
    game.findFirst.mockResolvedValue({ id: 'outro' });

    const { status, json } = await call('POST', '/games', {
      body: { titulo: 'Celeste', status: 'ZERADO', plataforma: 'PC' },
    });

    expect(status).toBe(409);
    expect(json).toEqual({
      statusCode: 409,
      message: DUPLICATE,
      fields: { titulo: DUPLICATE },
    });
  });

  it('a duplicata é por dono: a Bia cria o que a Ana já tem, a Ana não repete (CA-43)', async () => {
    // Banco com "Celeste / PC" da Ana: a checagem só acha o jogo quando o dono procurado é a Ana.
    game.findFirst.mockImplementation(({ where }: { where: { userId: string } }) =>
      Promise.resolve(where.userId === ANA_ID ? { id: ID } : null),
    );
    game.create.mockResolvedValue(row({ userId: BIA_ID }));

    const bia = await call('POST', '/games', {
      token: biaToken,
      body: { titulo: 'celeste', plataforma: 'pc', status: 'ZERADO' },
    });
    const ana = await call('POST', '/games', {
      body: { titulo: 'CELESTE', plataforma: 'PC', status: 'ZERADO' },
    });

    expect(bia.status).toBe(201);
    expect(ana.status).toBe(409);
    expect(ana.json).toMatchObject({ message: DUPLICATE });
    expect(game.findFirst).toHaveBeenCalledWith({
      where: { userId: BIA_ID, tituloNormalizado: 'celeste', plataformaNormalizada: 'pc' },
      select: { id: true },
    });
  });

  it('409 (e não 500) quando a corrida cai no @@unique do banco (CA-38)', async () => {
    game.findFirst.mockResolvedValue(null);
    game.create.mockRejectedValue(prismaError('P2002'));

    const { status } = await call('POST', '/games', {
      body: { titulo: 'Celeste', status: 'ZERADO' },
    });

    expect(status).toBe(409);
  });
});

describe('PATCH /api/games/:id', () => {
  it('200 com o jogo atualizado, sem userId na resposta (CA-08, CA-46)', async () => {
    game.findUnique.mockResolvedValue(row({ status: 'QUERO_JOGAR' }));
    game.findFirst.mockResolvedValue(null);
    game.update.mockResolvedValue(row({ status: 'JOGANDO' }));

    const { status, json } = await call('PATCH', `/games/${ID}`, { body: { status: 'JOGANDO' } });

    expect(status).toBe(200);
    expect(json).toMatchObject({ id: ID, status: 'JOGANDO' });
    expect(json).not.toHaveProperty('userId');
    expect(game.findUnique).toHaveBeenCalledWith({ where: { id: ID, userId: ANA_ID } });
  });

  it('400 para userId no corpo, sem consultar o banco (CA-46)', async () => {
    const { status, json } = await call('PATCH', `/games/${ID}`, { body: { userId: BIA_ID } });

    expect(status).toBe(400);
    expect(json).toMatchObject({ message: expect.stringContaining('userId') });
    expect(game.findUnique).not.toHaveBeenCalled();
  });

  it('400 para body vazio (CA-24)', async () => {
    const { status } = await call('PATCH', `/games/${ID}`, { body: {} });

    expect(status).toBe(400);
    expect(game.update).not.toHaveBeenCalled();
  });

  it.each([
    ['titulo null', { titulo: null }, 'titulo'],
    ['status null', { status: null }, 'status'],
  ])('400 com fields para %s (CA-52)', async (_nome, body, campo) => {
    const { status, json } = await call('PATCH', `/games/${ID}`, { body });

    expect(status).toBe(400);
    expect(json).toMatchObject({ fields: { [campo]: expect.any(String) } });
    expect(game.update).not.toHaveBeenCalled();
  });

  it('400 para PATCH só com { status: QUERO_JOGAR } num jogo com nota (CA-21)', async () => {
    game.findUnique.mockResolvedValue(row({ status: 'JOGANDO', nota: 7 }));

    const { status, json } = await call('PATCH', `/games/${ID}`, {
      body: { status: 'QUERO_JOGAR' },
    });

    expect(status).toBe(400);
    expect(json).toMatchObject({ fields: { nota: RATING } });
    expect(game.update).not.toHaveBeenCalled();
  });

  it('400 para id que não é UUID, sem consultar o banco (CA-26)', async () => {
    const { status } = await call('PATCH', '/games/abc', { body: { titulo: 'X' } });

    expect(status).toBe(400);
    expect(game.findUnique).not.toHaveBeenCalled();
  });

  it('404 com a mensagem literal para UUID sem jogo (CA-27)', async () => {
    game.findUnique.mockResolvedValue(null);

    const { status, json } = await call('PATCH', `/games/${ID}`, { body: { titulo: 'X' } });

    expect(status).toBe(404);
    expect(json).toMatchObject({ statusCode: 404, message: 'Jogo não encontrado' });
  });

  it('409 quando a edição duplica outro jogo (CA-34)', async () => {
    game.findUnique.mockResolvedValue(row({ titulo: 'Hades' }));
    game.findFirst.mockResolvedValue({ id: 'celeste' });

    const { status, json } = await call('PATCH', `/games/${ID}`, { body: { titulo: 'celeste' } });

    expect(status).toBe(409);
    expect(json).toMatchObject({ fields: { titulo: DUPLICATE } });
  });
});

describe('DELETE /api/games/:id', () => {
  it('204 sem corpo (CA-12)', async () => {
    game.delete.mockResolvedValue(row());

    const { status, text } = await call('DELETE', `/games/${ID}`);

    expect(status).toBe(204);
    expect(text).toBe('');
  });

  it('404 com a mensagem literal quando o jogo não existe ou já foi removido (CA-28, CA-29)', async () => {
    game.delete.mockRejectedValue(prismaError('P2025'));

    const { status, json } = await call('DELETE', `/games/${ID}`);

    expect(status).toBe(404);
    expect(json).toMatchObject({ message: 'Jogo não encontrado' });
  });

  it('400 para id que não é UUID (CA-26)', async () => {
    const { status } = await call('DELETE', '/games/abc');

    expect(status).toBe(400);
    expect(game.delete).not.toHaveBeenCalled();
  });
});

describe('sem token (CA-41)', () => {
  it.each([
    ['GET', '/games'],
    ['POST', '/games'],
    ['PATCH', `/games/${ID}`],
    ['DELETE', `/games/${ID}`],
    ['PUT', `/games/${ID}/capa`],
    ['DELETE', `/games/${ID}/capa`],
  ])(
    '%s %s → 401 AUTH_NAO_AUTENTICADO, sem tocar no banco nem no storage',
    async (method, path) => {
      const { status, json } = await call(method, path, { token: null });

      expect(status).toBe(401);
      expect(json).toMatchObject({ statusCode: 401, code: 'AUTH_NAO_AUTENTICADO' });
      [...Object.values(game), storage.upload, storage.remove].forEach((fn) =>
        expect(fn).not.toHaveBeenCalled(),
      );
    },
  );
});

describe('jogo de outro usuário (CA-42)', () => {
  // O jogo ID é da Ana: toda busca por id que não traz o dono Ana não o encontra.
  beforeEach(() => {
    game.findUnique.mockImplementation(({ where }: { where: { userId: string } }) =>
      Promise.resolve(
        where.userId === ANA_ID ? row({ capaPath: `${ANA_ID}/${ID}/capa.png` }) : null,
      ),
    );
    game.delete.mockImplementation(({ where }: { where: { userId: string } }) =>
      where.userId === ANA_ID ? Promise.resolve(row()) : Promise.reject(prismaError('P2025')),
    );
  });

  it.each([
    ['PATCH', `/games/${ID}`, { body: { titulo: 'Roubado' } }],
    ['DELETE', `/games/${ID}`, {}],
    ['PUT', `/games/${ID}/capa`, { upload: true }],
    ['DELETE', `/games/${ID}/capa`, {}],
  ])(
    '%s %s da Bia → 404 "Jogo não encontrado", e o jogo da Ana não muda',
    async (method, path, extra: { body?: unknown; upload?: boolean }) => {
      const { status, json } = await call(method, path, {
        token: biaToken,
        body: extra.body,
        form: extra.upload ? pngForm() : undefined,
      });

      expect(status).toBe(404);
      expect(json).toMatchObject({ statusCode: 404, message: 'Jogo não encontrado' });
      expect(game.update).not.toHaveBeenCalled();
      expect(storage.upload).not.toHaveBeenCalled();
      expect(storage.remove).not.toHaveBeenCalled();
    },
  );

  it('a remoção pede o jogo com o dono no where (a Bia não apaga o da Ana)', async () => {
    await call('DELETE', `/games/${ID}`, { token: biaToken });

    expect(game.delete).toHaveBeenCalledWith({ where: { id: ID, userId: BIA_ID } });
  });

  it('GET da Bia não traz o jogo da Ana', async () => {
    game.findMany.mockImplementation(({ where }: { where: { userId: string } }) =>
      Promise.resolve(where.userId === ANA_ID ? [row()] : []),
    );

    const { json } = await call('GET', '/games', { token: biaToken });

    expect(json).toEqual([]);
  });
});
