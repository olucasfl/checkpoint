import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, type Game as GameRow } from '@prisma/client';
import { type AddressInfo } from 'node:net';
import { createValidationPipe } from '../../common/pipes/app-validation.pipe';
import { API_GLOBAL_PREFIX } from '../../config/app.config';
import { PrismaService } from '../../database/prisma.service';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

/**
 * Sobe o módulo de verdade (controller + pipe global + service) numa porta local efêmera e fala
 * HTTP com ele por `fetch`. O PrismaService é um objeto simples de funções: nenhum teste toca o
 * banco real. Cobre o que o teste de service não vê: código de status, corpo e o pipe ligado.
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

function row(overrides: Partial<GameRow> = {}): GameRow {
  return {
    id: ID,
    titulo: 'Hollow Knight',
    plataforma: '',
    status: 'JOGANDO',
    nota: null,
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

async function call(method: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, text, json: text ? (JSON.parse(text) as unknown) : undefined };
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [GamesController],
    providers: [GamesService, { provide: PrismaService, useValue: { game } }],
  }).compile();

  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix(API_GLOBAL_PREFIX);
  app.useGlobalPipes(createValidationPipe());
  await app.listen(0, '127.0.0.1');

  const { port } = app.getHttpServer().address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}/${API_GLOBAL_PREFIX}`;
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  Object.values(game).forEach((fn) => fn.mockReset());
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
        criadoEm: '2026-09-23T12:00:00.000Z',
        atualizadoEm: '2026-09-23T12:00:00.000Z',
      },
    ]);
  });

  it('repassa ?status= ao filtro (CA-06)', async () => {
    game.findMany.mockResolvedValue([]);

    const { status, json } = await call('GET', '/games?status=JOGANDO');

    expect(status).toBe(200);
    expect(json).toEqual([]);
    expect(game.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'JOGANDO' } }),
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
  it('201 com o jogo criado (CA-01)', async () => {
    game.findFirst.mockResolvedValue(null);
    game.create.mockResolvedValue(row());

    const { status, json } = await call('POST', '/games', {
      titulo: 'Hollow Knight',
      status: 'JOGANDO',
    });

    expect(status).toBe(201);
    expect(json).toMatchObject({ id: ID, plataforma: null, nota: null });
  });

  it.each([
    ['titulo vazio (CA-13)', { titulo: '', status: 'JOGANDO' }, 'titulo'],
    ['status inválido (CA-15)', { titulo: 'X', status: 'PAUSADO' }, 'status'],
    ['nota 11 (CA-16)', { titulo: 'X', status: 'ZERADO', nota: 11 }, 'nota'],
  ])('400 com o campo apontado em fields: %s', async (_nome, body, campo) => {
    const { status, json } = await call('POST', '/games', body);

    expect(status).toBe(400);
    expect(json).toMatchObject({ statusCode: 400, fields: { [campo]: expect.any(String) } });
    expect(game.create).not.toHaveBeenCalled();
  });

  it('400 para campo não declarado (CA-18)', async () => {
    const { status, json } = await call('POST', '/games', {
      titulo: 'X',
      status: 'JOGANDO',
      cor: 'azul',
    });

    expect(status).toBe(400);
    expect(json).toMatchObject({ message: expect.stringContaining('cor') });
  });

  it('400 com fields.nota quando a nota vem com QUERO_JOGAR, e nada é criado (CA-19)', async () => {
    const { status, json } = await call('POST', '/games', {
      titulo: 'Hades',
      status: 'QUERO_JOGAR',
      nota: 8,
    });

    expect(status).toBe(400);
    expect(json).toEqual({ statusCode: 400, message: RATING, fields: { nota: RATING } });
    expect(game.create).not.toHaveBeenCalled();
  });

  it('409 com a mensagem literal em fields.titulo quando já existe (CA-30)', async () => {
    game.findFirst.mockResolvedValue({ id: 'outro' });

    const { status, json } = await call('POST', '/games', {
      titulo: 'Celeste',
      status: 'ZERADO',
      plataforma: 'PC',
    });

    expect(status).toBe(409);
    expect(json).toEqual({
      statusCode: 409,
      message: DUPLICATE,
      fields: { titulo: DUPLICATE },
    });
  });

  it('409 (e não 500) quando a corrida cai no @@unique do banco (CA-38)', async () => {
    game.findFirst.mockResolvedValue(null);
    game.create.mockRejectedValue(prismaError('P2002'));

    const { status } = await call('POST', '/games', { titulo: 'Celeste', status: 'ZERADO' });

    expect(status).toBe(409);
  });
});

describe('PATCH /api/games/:id', () => {
  it('200 com o jogo atualizado (CA-08)', async () => {
    game.findUnique.mockResolvedValue(row({ status: 'QUERO_JOGAR' }));
    game.findFirst.mockResolvedValue(null);
    game.update.mockResolvedValue(row({ status: 'JOGANDO' }));

    const { status, json } = await call('PATCH', `/games/${ID}`, { status: 'JOGANDO' });

    expect(status).toBe(200);
    expect(json).toMatchObject({ id: ID, status: 'JOGANDO' });
  });

  it('400 para body vazio (CA-24)', async () => {
    const { status } = await call('PATCH', `/games/${ID}`, {});

    expect(status).toBe(400);
    expect(game.update).not.toHaveBeenCalled();
  });

  it.each([
    ['titulo null', { titulo: null }, 'titulo'],
    ['status null', { status: null }, 'status'],
  ])('400 com fields para %s (CA-52)', async (_nome, body, campo) => {
    const { status, json } = await call('PATCH', `/games/${ID}`, body);

    expect(status).toBe(400);
    expect(json).toMatchObject({ fields: { [campo]: expect.any(String) } });
    expect(game.update).not.toHaveBeenCalled();
  });

  it('400 para PATCH só com { status: QUERO_JOGAR } num jogo com nota (CA-21)', async () => {
    game.findUnique.mockResolvedValue(row({ status: 'JOGANDO', nota: 7 }));

    const { status, json } = await call('PATCH', `/games/${ID}`, { status: 'QUERO_JOGAR' });

    expect(status).toBe(400);
    expect(json).toMatchObject({ fields: { nota: RATING } });
    expect(game.update).not.toHaveBeenCalled();
  });

  it('400 para id que não é UUID, sem consultar o banco (CA-26)', async () => {
    const { status } = await call('PATCH', '/games/abc', { titulo: 'X' });

    expect(status).toBe(400);
    expect(game.findUnique).not.toHaveBeenCalled();
  });

  it('404 com a mensagem literal para UUID sem jogo (CA-27)', async () => {
    game.findUnique.mockResolvedValue(null);

    const { status, json } = await call('PATCH', `/games/${ID}`, { titulo: 'X' });

    expect(status).toBe(404);
    expect(json).toMatchObject({ statusCode: 404, message: 'Jogo não encontrado' });
  });

  it('409 quando a edição duplica outro jogo (CA-34)', async () => {
    game.findUnique.mockResolvedValue(row({ titulo: 'Hades' }));
    game.findFirst.mockResolvedValue({ id: 'celeste' });

    const { status, json } = await call('PATCH', `/games/${ID}`, { titulo: 'celeste' });

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
