import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma, type Game as GameRow } from '@prisma/client';
import { type AddressInfo } from 'node:net';
import { badGatewayError } from '../../common/errors/api-error';
import { createValidationPipe } from '../../common/pipes/app-validation.pipe';
import { API_GLOBAL_PREFIX } from '../../config/app.config';
import { PrismaService } from '../../database/prisma.service';
import { StorageService } from './cover/storage.service';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

/**
 * Capa (etapa 2) por HTTP de verdade: o multipart é lido pelo multer real (limite de 2 MB, campo
 * `arquivo`), com PrismaService e StorageService como objetos simples de funções. Nenhum teste
 * toca o banco nem o Supabase.
 */
const ID = '3f2b8a52-9c1e-4d6a-8f31-0a7e5b2c9d44';
const OBJECT = `${ID}/7d1c2e60-1111-4222-8333-444455556666.png`;
const TWO_MB = 2 * 1024 * 1024;

const COVER_ERROR = {
  type: 'A capa deve ser uma imagem JPEG, PNG ou WebP',
  size: 'A capa deve ter no máximo 2 MB',
  missing: 'Envie a capa no campo "arquivo"',
  storage: 'Falha ao acessar o armazenamento de capas',
};

const game = {
  findMany: jest.fn(),
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};
const storage = { upload: jest.fn(), remove: jest.fn(), publicUrl: jest.fn() };

function row(overrides: Partial<GameRow> = {}): GameRow {
  return {
    id: ID,
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

/** PNG "válido" só até a assinatura (o que a API confere), completado com zeros até `size` bytes. */
function pngOfSize(size: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, Buffer.alloc(size - signature.length)]);
}

let app: INestApplication;
let baseUrl: string;

async function send(method: string, path: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${path}`, { method, ...init });
  const text = await response.text();
  return { status: response.status, json: text ? (JSON.parse(text) as unknown) : undefined };
}

interface UploadFile {
  content: Buffer | string;
  name?: string;
  type?: string;
  field?: string;
}

function upload(path: string, file: UploadFile | null) {
  const form = new FormData();
  if (file) {
    form.append(
      file.field ?? 'arquivo',
      new Blob([file.content], { type: file.type ?? 'image/png' }),
      file.name ?? 'capa.png',
    );
  } else {
    form.append('outro', 'valor');
  }
  return send('PUT', path, { body: form });
}

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    controllers: [GamesController],
    providers: [
      GamesService,
      { provide: PrismaService, useValue: { game } },
      { provide: StorageService, useValue: storage },
    ],
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
  [...Object.values(game), ...Object.values(storage)].forEach((fn) => fn.mockReset());
  storage.publicUrl.mockImplementation((path: string) => `https://storage.teste/capas/${path}`);
});

describe('PUT /api/games/:id/capa', () => {
  it('200 com a capaUrl, e o objeto sobe com o tipo detectado (CA-53)', async () => {
    game.findUnique.mockResolvedValue(row());
    game.update.mockResolvedValue(row({ capaPath: OBJECT }));

    const { status, json } = await upload(`/games/${ID}/capa`, { content: pngOfSize(200_000) });

    expect(status).toBe(200);
    expect(json).toMatchObject({ id: ID, capaUrl: `https://storage.teste/capas/${OBJECT}` });
    expect(json).not.toHaveProperty('capaPath');
    expect(storage.upload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${ID}/.+\\.png$`)),
      expect.any(Buffer),
      'image/png',
    );
  });

  it('a assinatura vale, não o Content-Type nem o nome: PNG como octet-stream .bin → 200 (CA-55)', async () => {
    game.findUnique.mockResolvedValue(row());
    game.update.mockResolvedValue(row({ capaPath: OBJECT }));

    const { status } = await upload(`/games/${ID}/capa`, {
      content: pngOfSize(1000),
      name: 'foto.bin',
      type: 'application/octet-stream',
    });

    expect(status).toBe(200);
    expect(storage.upload).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Buffer),
      'image/png',
    );
  });

  it('texto chamado falso.png com Content-Type image/png → 400 e nada vai ao bucket (CA-55)', async () => {
    game.findUnique.mockResolvedValue(row());

    const { status, json } = await upload(`/games/${ID}/capa`, {
      content: 'isto não é uma imagem',
      name: 'falso.png',
      type: 'image/png',
    });

    expect(status).toBe(400);
    expect(json).toEqual({
      statusCode: 400,
      message: COVER_ERROR.type,
      fields: { arquivo: COVER_ERROR.type },
    });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it.each([
    ['GIF', 'GIF89a\x01\x00\x01\x00'],
    ['SVG', '<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
    ['PDF', '%PDF-1.7\n'],
  ])('%s → 400 com a mensagem de tipo (CA-56)', async (_nome, content) => {
    game.findUnique.mockResolvedValue(row());

    const { status, json } = await upload(`/games/${ID}/capa`, { content });

    expect(status).toBe(400);
    expect(json).toMatchObject({ fields: { arquivo: COVER_ERROR.type } });
  });

  it('2 MB + 1 byte → 413 com a mensagem literal, sem tocar no banco nem no storage (CA-57)', async () => {
    const { status, json } = await upload(`/games/${ID}/capa`, { content: pngOfSize(TWO_MB + 1) });

    expect(status).toBe(413);
    expect(json).toEqual({
      statusCode: 413,
      message: COVER_ERROR.size,
      fields: { arquivo: COVER_ERROR.size },
    });
    expect(game.findUnique).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('um arquivo de ~1,9 MB ainda passa (CA-57)', async () => {
    game.findUnique.mockResolvedValue(row());
    game.update.mockResolvedValue(row({ capaPath: OBJECT }));

    const { status } = await upload(`/games/${ID}/capa`, { content: pngOfSize(1_900_000) });

    expect(status).toBe(200);
  });

  it.each([
    ['sem o campo arquivo', null],
    ['arquivo em outro campo (file)', { content: pngOfSize(1000), field: 'file' }],
    ['arquivo vazio', { content: Buffer.alloc(0) }],
  ])('%s → 400 com fields.arquivo (CA-58)', async (_nome, file) => {
    const { status, json } = await upload(`/games/${ID}/capa`, file);

    expect(status).toBe(400);
    expect(json).toMatchObject({ statusCode: 400, fields: { arquivo: expect.any(String) } });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('corpo que não é multipart → 400 com fields.arquivo (CA-58)', async () => {
    const { status, json } = await send('PUT', `/games/${ID}/capa`, {
      headers: { 'content-type': 'application/json' },
      body: '{"arquivo":"x"}',
    });

    expect(status).toBe(400);
    expect(json).toMatchObject({ fields: { arquivo: COVER_ERROR.missing } });
  });

  it('id que não é UUID → 400 (CA-59)', async () => {
    const { status } = await upload('/games/abc/capa', { content: pngOfSize(1000) });

    expect(status).toBe(400);
    expect(game.findUnique).not.toHaveBeenCalled();
  });

  it('UUID válido sem jogo → 404 com a mensagem literal (CA-59)', async () => {
    game.findUnique.mockResolvedValue(null);

    const { status, json } = await upload(`/games/${ID}/capa`, { content: pngOfSize(1000) });

    expect(status).toBe(404);
    expect(json).toMatchObject({ statusCode: 404, message: 'Jogo não encontrado' });
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('arquivo grande para id inexistente → 413: o multipart é lido antes do jogo (CA-59)', async () => {
    game.findUnique.mockResolvedValue(null);

    const { status } = await upload(`/games/${ID}/capa`, { content: pngOfSize(TWO_MB + 1) });

    expect(status).toBe(413);
  });

  it('falha do storage → 502 com fields.arquivo, e nunca 500 (CA-63)', async () => {
    game.findUnique.mockResolvedValue(row());
    storage.upload.mockRejectedValue(
      badGatewayError(COVER_ERROR.storage, { arquivo: COVER_ERROR.storage }),
    );

    const { status, json } = await upload(`/games/${ID}/capa`, { content: pngOfSize(1000) });

    expect(status).toBe(502);
    expect(json).toEqual({
      statusCode: 502,
      message: COVER_ERROR.storage,
      fields: { arquivo: COVER_ERROR.storage },
    });
    expect(game.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/games/:id/capa', () => {
  it('200 com capaUrl: null, e o objeto é removido (CA-64)', async () => {
    game.findUnique.mockResolvedValue(row({ capaPath: OBJECT }));
    game.update.mockResolvedValue(row({ capaPath: null }));

    const { status, json } = await send('DELETE', `/games/${ID}/capa`);

    expect(status).toBe(200);
    expect(json).toMatchObject({ id: ID, capaUrl: null });
    expect(storage.remove).toHaveBeenCalledWith(OBJECT);
  });

  it('jogo sem capa também é 200, sem chamar o storage (CA-64)', async () => {
    game.findUnique.mockResolvedValue(row({ capaPath: null }));

    const { status, json } = await send('DELETE', `/games/${ID}/capa`);

    expect(status).toBe(200);
    expect(json).toMatchObject({ capaUrl: null });
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('404 para jogo inexistente e 400 para id que não é UUID (CA-64)', async () => {
    game.findUnique.mockResolvedValue(null);

    expect((await send('DELETE', `/games/${ID}/capa`)).status).toBe(404);
    expect((await send('DELETE', '/games/abc/capa')).status).toBe(400);
  });

  it('falha do storage → 502 e a capa continua associada (CA-65)', async () => {
    game.findUnique.mockResolvedValue(row({ capaPath: OBJECT }));
    storage.remove.mockRejectedValue(
      badGatewayError(COVER_ERROR.storage, { arquivo: COVER_ERROR.storage }),
    );

    const { status, json } = await send('DELETE', `/games/${ID}/capa`);

    expect(status).toBe(502);
    expect(json).toMatchObject({ fields: { arquivo: COVER_ERROR.storage } });
    expect(game.update).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/games/:id com capa', () => {
  it('204, e o objeto da capa é apagado do storage (CA-66)', async () => {
    game.delete.mockResolvedValue(row({ capaPath: OBJECT }));

    const { status } = await send('DELETE', `/games/${ID}`);

    expect(status).toBe(204);
    expect(storage.remove).toHaveBeenCalledWith(OBJECT);
  });

  it('204 mesmo se o storage falhar: o jogo já foi removido (CA-66)', async () => {
    game.delete.mockResolvedValue(row({ capaPath: OBJECT }));
    storage.remove.mockRejectedValue(
      badGatewayError(COVER_ERROR.storage, { arquivo: COVER_ERROR.storage }),
    );

    expect((await send('DELETE', `/games/${ID}`)).status).toBe(204);
  });

  it('404 quando o jogo não existe (P2025)', async () => {
    game.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('erro simulado', {
        code: 'P2025',
        clientVersion: 'teste',
      }),
    );

    expect((await send('DELETE', `/games/${ID}`)).status).toBe(404);
  });
});

describe('POST/PATCH não aceitam capa pelo JSON (CA-67)', () => {
  const jsonInit = (body: unknown): RequestInit => ({
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  it.each(['capaUrl', 'capaPath'])('POST com %s no body → 400', async (campo) => {
    const { status, json } = await send(
      'POST',
      '/games',
      jsonInit({ titulo: 'X', status: 'JOGANDO', [campo]: 'http://x/y.png' }),
    );

    expect(status).toBe(400);
    expect(json).toMatchObject({ message: expect.stringContaining(campo) });
  });

  it.each(['capaUrl', 'capaPath'])('PATCH com %s no body → 400', async (campo) => {
    const { status } = await send('PATCH', `/games/${ID}`, jsonInit({ [campo]: 'http://x/y.png' }));

    expect(status).toBe(400);
    expect(game.update).not.toHaveBeenCalled();
  });
});
