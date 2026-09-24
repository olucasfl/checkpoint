import { HttpException, Logger } from '@nestjs/common';
import { Prisma, type Game as GameRow } from '@prisma/client';
import { badGatewayError } from '../../common/errors/api-error';
import { type PrismaService } from '../../database/prisma.service';
import { type StorageService } from './cover/storage.service';
import { GamesService } from './games.service';

/** Casos de capa do GamesService. PrismaService e StorageService são objetos simples de funções. */
const ID = '3f2b8a52-9c1e-4d6a-8f31-0a7e5b2c9d44';
/** Dono de todos os jogos destes testes. */
const USER = '0b6c1f7e-2a3d-4e5f-8a9b-1c2d3e4f5a6b';
const OLD = `${USER}/${ID}/00000000-0000-4000-8000-000000000000.png`;
/** Capa enviada antes da etapa 3 de autenticacao: `<gameId>/<uuid>.<ext>`, sem o prefixo do dono. */
const LEGACY = `${ID}/11111111-2222-4333-8444-555555555555.jpg`;
const STORAGE_FAILURE = 'Falha ao acessar o armazenamento de capas';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
const NEW_OBJECT = new RegExp(
  `^${USER}/${ID}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.`,
);

function row(overrides: Partial<GameRow> = {}): GameRow {
  return {
    id: ID,
    userId: USER,
    titulo: 'Celeste',
    plataforma: 'PC',
    status: 'ZERADO',
    nota: 9,
    capaPath: null,
    tituloNormalizado: 'celeste',
    plataformaNormalizada: 'pc',
    criadoEm: new Date('2026-09-23T12:00:00.000Z'),
    atualizadoEm: new Date('2026-09-23T13:00:00.000Z'),
    ...overrides,
  };
}

function setup() {
  const game = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const storage = {
    upload: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    publicUrl: jest.fn((path: string) => `https://storage.teste/capas/${path}`),
  };
  const service = new GamesService(
    { game } as unknown as PrismaService,
    storage as unknown as StorageService,
  );
  return { service, game, storage };
}

async function failure(promise: Promise<unknown>): Promise<HttpException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof HttpException) {
      return error;
    }
    throw error;
  }
  throw new Error('esperava que a operacao falhasse');
}

function storageFailure() {
  return badGatewayError(STORAGE_FAILURE, { arquivo: STORAGE_FAILURE });
}

describe('GamesService — capa', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('setCover', () => {
    it('sobe <userId>/<id>/<uuid>.png, grava o capaPath e devolve a capaUrl sem vazar o capaPath (CA-53, CA-60, CA-45)', async () => {
      const { service, game, storage } = setup();
      game.findUnique.mockResolvedValue(row());
      game.update.mockImplementation(({ data }: { data: { capaPath: string } }) =>
        Promise.resolve(row({ capaPath: data.capaPath })),
      );

      const result = await service.setCover(USER, ID, { buffer: PNG });

      const [path, content, mime] = storage.upload.mock.calls[0] as [string, Buffer, string];
      expect(path).toMatch(NEW_OBJECT);
      expect(path.endsWith('.png')).toBe(true);
      expect(content).toBe(PNG);
      expect(mime).toBe('image/png');
      expect(game.findUnique).toHaveBeenCalledWith({ where: { id: ID, userId: USER } });
      expect(game.update).toHaveBeenCalledWith({
        where: { id: ID, userId: USER },
        data: { capaPath: path },
      });
      expect(result.capaUrl).toBe(`https://storage.teste/capas/${path}`);
      expect(result).not.toHaveProperty('capaPath');
      expect(result).not.toHaveProperty('userId');
    });

    it.each([
      ['JPEG', JPEG, 'jpg', 'image/jpeg'],
      ['WebP', WEBP, 'webp', 'image/webp'],
    ])(
      'usa extensão e tipo pela assinatura: %s (CA-54)',
      async (_nome, buffer, extension, mime) => {
        const { service, game, storage } = setup();
        game.findUnique.mockResolvedValue(row());
        game.update.mockResolvedValue(row());

        await service.setCover(USER, ID, { buffer });

        const [path, , sentMime] = storage.upload.mock.calls[0] as [string, Buffer, string];
        expect(path.endsWith(`.${extension}`)).toBe(true);
        expect(sentMime).toBe(mime);
      },
    );

    it('sem capa antiga, não chama remove', async () => {
      const { service, game, storage } = setup();
      game.findUnique.mockResolvedValue(row({ capaPath: null }));
      game.update.mockResolvedValue(row());

      await service.setCover(USER, ID, { buffer: PNG });

      expect(storage.remove).not.toHaveBeenCalled();
    });

    it('troca a capa: envia o novo, grava, e só então apaga o antigo (CA-61)', async () => {
      const { service, game, storage } = setup();
      game.findUnique.mockResolvedValue(row({ capaPath: OLD }));
      game.update.mockResolvedValue(row());

      await service.setCover(USER, ID, { buffer: PNG });

      expect(storage.remove).toHaveBeenCalledWith(OLD);
      const upload = storage.upload.mock.invocationCallOrder[0] as number;
      const update = game.update.mock.invocationCallOrder[0] as number;
      const remove = storage.remove.mock.invocationCallOrder[0] as number;
      expect(upload).toBeLessThan(update);
      expect(update).toBeLessThan(remove);
    });

    it('falha ao remover o antigo: devolve a capa nova e registra aviso (CA-62)', async () => {
      const { service, game, storage } = setup();
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      game.findUnique.mockResolvedValue(row({ capaPath: OLD }));
      game.update.mockImplementation(({ data }: { data: { capaPath: string } }) =>
        Promise.resolve(row({ capaPath: data.capaPath })),
      );
      storage.remove.mockRejectedValue(storageFailure());

      const result = await service.setCover(USER, ID, { buffer: PNG });

      expect(result.capaUrl).not.toBeNull();
      expect(result.capaUrl).not.toContain(OLD);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(OLD));
    });

    it.each([
      ['texto', Buffer.from('nao sou uma imagem')],
      ['GIF', Buffer.from('GIF89a\x01\x00')],
      ['PDF', Buffer.from('%PDF-1.7')],
    ])(
      'rejeita %s com 400 em fields.arquivo e não envia nada (CA-55, CA-56)',
      async (_nome, buffer) => {
        const { service, game, storage } = setup();
        game.findUnique.mockResolvedValue(row());

        const error = await failure(service.setCover(USER, ID, { buffer }));

        expect(error.getStatus()).toBe(400);
        expect(error.getResponse()).toEqual({
          statusCode: 400,
          message: 'A capa deve ser uma imagem JPEG, PNG ou WebP',
          fields: { arquivo: 'A capa deve ser uma imagem JPEG, PNG ou WebP' },
        });
        expect(storage.upload).not.toHaveBeenCalled();
        expect(game.update).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['sem arquivo', undefined],
      ['arquivo vazio', { buffer: Buffer.alloc(0) }],
    ])(
      'rejeita %s com 400 em fields.arquivo antes de consultar o banco (CA-58)',
      async (_nome, file) => {
        const { service, game } = setup();

        const error = await failure(service.setCover(USER, ID, file));

        expect(error.getStatus()).toBe(400);
        expect(error.getResponse()).toMatchObject({ fields: { arquivo: expect.any(String) } });
        expect(game.findUnique).not.toHaveBeenCalled();
      },
    );

    it('jogo inexistente ou de outro usuário → 404, mesmo com arquivo inválido, e nada é enviado (CA-59, CA-42)', async () => {
      const { service, game, storage } = setup();
      game.findUnique.mockResolvedValue(null);

      const error = await failure(service.setCover(USER, ID, { buffer: Buffer.from('texto') }));

      expect(error.getStatus()).toBe(404);
      expect(error.getResponse()).toMatchObject({ message: 'Jogo não encontrado' });
      expect(storage.upload).not.toHaveBeenCalled();
    });

    it('falha do storage no upload → 502 e o capaPath fica como estava (CA-63)', async () => {
      const { service, game, storage } = setup();
      game.findUnique.mockResolvedValue(row({ capaPath: OLD }));
      storage.upload.mockRejectedValue(storageFailure());

      const error = await failure(service.setCover(USER, ID, { buffer: PNG }));

      expect(error.getStatus()).toBe(502);
      expect(game.update).not.toHaveBeenCalled();
      expect(storage.remove).not.toHaveBeenCalled();
    });

    it('falha do banco depois do upload apaga o objeto novo, para não deixá-lo órfão', async () => {
      const { service, game, storage } = setup();
      game.findUnique.mockResolvedValue(row());
      game.update.mockRejectedValue(new Error('conexao perdida'));

      await expect(service.setCover(USER, ID, { buffer: PNG })).rejects.toThrow('conexao perdida');

      const [path] = storage.upload.mock.calls[0] as [string];
      expect(storage.remove).toHaveBeenCalledWith(path);
    });

    it('jogo apagado no meio (P2025 no update) → 404 e o objeto novo é apagado', async () => {
      const { service, game, storage } = setup();
      game.findUnique.mockResolvedValue(row());
      game.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('erro simulado', {
          code: 'P2025',
          clientVersion: 'teste',
        }),
      );

      const error = await failure(service.setCover(USER, ID, { buffer: PNG }));

      expect(error.getStatus()).toBe(404);
      expect(storage.remove).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeCover', () => {
    it('apaga o objeto ANTES de zerar o capaPath (CA-64)', async () => {
      const { service, game, storage } = setup();
      game.findUnique.mockResolvedValue(row({ capaPath: OLD }));
      game.update.mockResolvedValue(row({ capaPath: null }));

      const result = await service.removeCover(USER, ID);

      expect(storage.remove).toHaveBeenCalledWith(OLD);
      expect(game.update).toHaveBeenCalledWith({
        where: { id: ID, userId: USER },
        data: { capaPath: null },
      });
      expect(result.capaUrl).toBeNull();
      expect(storage.remove.mock.invocationCallOrder[0]).toBeLessThan(
        game.update.mock.invocationCallOrder[0] as number,
      );
    });

    it('jogo sem capa: devolve o jogo sem chamar o storage nem o banco (idempotente) (CA-64)', async () => {
      const { service, game, storage } = setup();
      game.findUnique.mockResolvedValue(row({ capaPath: null }));

      const result = await service.removeCover(USER, ID);

      expect(result.capaUrl).toBeNull();
      expect(storage.remove).not.toHaveBeenCalled();
      expect(game.update).not.toHaveBeenCalled();
    });

    it('jogo inexistente ou de outro usuário → 404, sem chamar o storage (CA-64, CA-42)', async () => {
      const { service, game, storage } = setup();
      game.findUnique.mockResolvedValue(null);

      const error = await failure(service.removeCover(USER, ID));

      expect(error.getStatus()).toBe(404);
      expect(game.findUnique).toHaveBeenCalledWith({ where: { id: ID, userId: USER } });
      expect(storage.remove).not.toHaveBeenCalled();
    });

    it('falha do storage → 502 e a capa continua associada ao jogo (CA-65)', async () => {
      const { service, game, storage } = setup();
      game.findUnique.mockResolvedValue(row({ capaPath: OLD }));
      storage.remove.mockRejectedValue(storageFailure());

      const error = await failure(service.removeCover(USER, ID));

      expect(error.getStatus()).toBe(502);
      expect(error.getResponse()).toMatchObject({ fields: { arquivo: expect.any(String) } });
      expect(game.update).not.toHaveBeenCalled();
    });
  });

  describe('remover o jogo', () => {
    it('apaga o objeto da capa depois de remover a linha (CA-66)', async () => {
      const { service, game, storage } = setup();
      game.delete.mockResolvedValue(row({ capaPath: OLD }));

      await service.remove(USER, ID);

      expect(storage.remove).toHaveBeenCalledWith(OLD);
      expect(game.delete.mock.invocationCallOrder[0]).toBeLessThan(
        storage.remove.mock.invocationCallOrder[0] as number,
      );
    });

    it('falha ao apagar o objeto não impede o sucesso e registra aviso sem segredos (CA-66)', async () => {
      const { service, game, storage } = setup();
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      game.delete.mockResolvedValue(row({ capaPath: OLD }));
      storage.remove.mockRejectedValue(storageFailure());

      await expect(service.remove(USER, ID)).resolves.toBeUndefined();

      expect(warn).toHaveBeenCalledWith(expect.stringContaining(OLD));
    });

    it('jogo sem capa: não chama o storage', async () => {
      const { service, game, storage } = setup();
      game.delete.mockResolvedValue(row({ capaPath: null }));

      await service.remove(USER, ID);

      expect(storage.remove).not.toHaveBeenCalled();
    });

    it('jogo inexistente (P2025) → 404 e não chama o storage', async () => {
      const { service, game, storage } = setup();
      game.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('erro simulado', {
          code: 'P2025',
          clientVersion: 'teste',
        }),
      );

      const error = await failure(service.remove(USER, ID));

      expect(error.getStatus()).toBe(404);
      expect(storage.remove).not.toHaveBeenCalled();
    });
  });

  describe('capaUrl nas respostas (CA-60)', () => {
    it('list e update trazem a capaUrl e nunca o capaPath', async () => {
      const { service, game } = setup();
      game.findMany.mockResolvedValue([row({ capaPath: OLD })]);
      game.findUnique.mockResolvedValue(row({ capaPath: OLD }));
      game.findFirst.mockResolvedValue(null);
      game.update.mockResolvedValue(row({ capaPath: OLD, nota: 8 }));

      const [listed] = await service.list(USER);
      const updated = await service.update(USER, ID, { nota: 8 });

      for (const result of [listed, updated]) {
        expect(result?.capaUrl).toBe(`https://storage.teste/capas/${OLD}`);
        expect(result).not.toHaveProperty('capaPath');
      }
    });

    it('capa enviada antes da etapa 3 (caminho sem o dono) gera a capaUrl pelo caminho gravado (CA-45)', async () => {
      const { service, game, storage } = setup();
      game.findMany.mockResolvedValue([row({ capaPath: LEGACY })]);

      const [listed] = await service.list(USER);

      expect(storage.publicUrl).toHaveBeenCalledWith(LEGACY);
      expect(listed?.capaUrl).toBe(`https://storage.teste/capas/${LEGACY}`);
    });

    it('trocar ou remover a capa antiga apaga o objeto do caminho antigo (CA-45)', async () => {
      const { service, game, storage } = setup();
      game.findUnique.mockResolvedValue(row({ capaPath: LEGACY }));
      game.update.mockResolvedValue(row());

      await service.setCover(USER, ID, { buffer: PNG });
      await service.removeCover(USER, ID);

      const [newPath] = storage.upload.mock.calls[0] as [string];
      expect(newPath).toMatch(NEW_OBJECT);
      expect(storage.remove).toHaveBeenNthCalledWith(1, LEGACY);
      expect(storage.remove).toHaveBeenNthCalledWith(2, LEGACY);
    });

    it('jogo criado não tem capa', async () => {
      const { service, game } = setup();
      game.findFirst.mockResolvedValue(null);
      game.create.mockResolvedValue(row({ capaPath: null }));

      const created = await service.create(USER, { titulo: 'Celeste', status: 'ZERADO' });

      expect(created.capaUrl).toBeNull();
    });
  });
});
