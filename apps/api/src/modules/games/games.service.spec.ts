import { HttpException } from '@nestjs/common';
import { Prisma, type Game as GameRow } from '@prisma/client';
import { type PrismaService } from '../../database/prisma.service';
import { type StorageService } from './cover/storage.service';
import { GamesService } from './games.service';

const ID = '3f2b8a52-9c1e-4d6a-8f31-0a7e5b2c9d44';
const DUPLICATE = 'Já existe esse jogo nesta plataforma';
const RATING = 'Nota só pode ser preenchida quando o status é Zerado ou Jogando';

function row(overrides: Partial<GameRow> = {}): GameRow {
  return {
    id: ID,
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

// PrismaService e StorageService sao sempre objetos simples de funcoes: nenhum teste toca o banco
// nem o Supabase reais. Os casos de capa ficam em games.cover.service.spec.ts.
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

function prismaError(code: string) {
  return new Prisma.PrismaClientKnownRequestError('erro simulado', {
    code,
    clientVersion: 'teste',
  });
}

describe('GamesService', () => {
  describe('list', () => {
    it('lista todos ordenando por atualizadoEm e depois criadoEm, ambos decrescentes (CA-05)', async () => {
      const { service, game } = setup();
      game.findMany.mockResolvedValue([row()]);

      await service.list();

      expect(game.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: [{ atualizadoEm: 'desc' }, { criadoEm: 'desc' }],
      });
    });

    it('filtra por status quando informado (CA-06)', async () => {
      const { service, game } = setup();
      game.findMany.mockResolvedValue([]);

      await service.list('JOGANDO');

      expect(game.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'JOGANDO' } }),
      );
    });

    it('devolve [] quando nao ha jogos (CA-07)', async () => {
      const { service, game } = setup();
      game.findMany.mockResolvedValue([]);

      await expect(service.list('ZERADO')).resolves.toEqual([]);
    });

    it('expoe plataforma vazia como null e nao vaza as colunas normalizadas (CA-01, CA-04)', async () => {
      const { service, game } = setup();
      game.findMany.mockResolvedValue([
        row({ plataforma: '', plataformaNormalizada: '', nota: null }),
      ]);

      const [result] = await service.list();

      expect(result).toEqual({
        id: ID,
        titulo: 'Celeste',
        plataforma: null,
        status: 'ZERADO',
        nota: null,
        capaUrl: null,
        criadoEm: '2026-09-23T12:00:00.000Z',
        atualizadoEm: '2026-09-23T13:00:00.000Z',
      });
      expect(result).not.toHaveProperty('tituloNormalizado');
      expect(result).not.toHaveProperty('plataformaNormalizada');
    });
  });

  describe('create', () => {
    it('grava titulo e plataforma aparados, com as chaves de unicidade em minusculas (CA-03, CA-31)', async () => {
      const { service, game } = setup();
      game.findFirst.mockResolvedValue(null);
      game.create.mockResolvedValue(row());

      await service.create({
        titulo: '  Outer Wilds  ',
        status: 'QUERO_JOGAR',
        plataforma: ' PC ',
      });

      expect(game.create).toHaveBeenCalledWith({
        data: {
          titulo: 'Outer Wilds',
          plataforma: 'PC',
          status: 'QUERO_JOGAR',
          nota: null,
          tituloNormalizado: 'outer wilds',
          plataformaNormalizada: 'pc',
        },
      });
    });

    it('trata plataforma ausente, null e so espacos como "" (CA-04, CA-33)', async () => {
      const { service, game } = setup();
      game.findFirst.mockResolvedValue(null);
      game.create.mockResolvedValue(row());

      for (const plataforma of [undefined, null, '   ']) {
        game.create.mockClear();
        await service.create({ titulo: 'Hades', status: 'JOGANDO', plataforma });

        expect(game.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ plataforma: '', plataformaNormalizada: '' }),
        });
      }
    });

    it('aceita nota com JOGANDO e ZERADO (CA-02)', async () => {
      const { service, game } = setup();
      game.findFirst.mockResolvedValue(null);
      game.create.mockResolvedValue(row());

      await service.create({ titulo: 'Celeste', status: 'ZERADO', nota: 9 });
      await service.create({ titulo: 'Hades', status: 'JOGANDO', nota: 0 });

      expect(game.create).toHaveBeenCalledTimes(2);
    });

    it('rejeita nota com QUERO_JOGAR com 400 em fields.nota e nao cria nada (CA-19)', async () => {
      const { service, game } = setup();

      const error = await failure(
        service.create({ titulo: 'Hades', status: 'QUERO_JOGAR', nota: 8 }),
      );

      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toEqual({
        statusCode: 400,
        message: RATING,
        fields: { nota: RATING },
      });
      expect(game.create).not.toHaveBeenCalled();
    });

    it('aceita nota null com QUERO_JOGAR', async () => {
      const { service, game } = setup();
      game.findFirst.mockResolvedValue(null);
      game.create.mockResolvedValue(row());

      await service.create({ titulo: 'Hades', status: 'QUERO_JOGAR', nota: null });

      expect(game.create).toHaveBeenCalledWith({ data: expect.objectContaining({ nota: null }) });
    });

    it('devolve 409 com fields.titulo quando a checagem previa acha duplicata e nao cria (CA-30, CA-31, CA-33)', async () => {
      const { service, game } = setup();
      game.findFirst.mockResolvedValue({ id: 'outro' });

      const error = await failure(
        service.create({ titulo: '  cELESTE ', status: 'ZERADO', plataforma: 'pc ' }),
      );

      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toEqual({
        statusCode: 409,
        message: DUPLICATE,
        fields: { titulo: DUPLICATE },
      });
      expect(game.findFirst).toHaveBeenCalledWith({
        where: { tituloNormalizado: 'celeste', plataformaNormalizada: 'pc' },
        select: { id: true },
      });
      expect(game.create).not.toHaveBeenCalled();
    });

    it('compara duplicata com plataforma "" quando o jogo nao tem plataforma (CA-33)', async () => {
      const { service, game } = setup();
      game.findFirst.mockResolvedValue({ id: 'outro' });

      await failure(service.create({ titulo: 'celeste', status: 'ZERADO', plataforma: '   ' }));

      expect(game.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tituloNormalizado: 'celeste', plataformaNormalizada: '' },
        }),
      );
    });

    it('traduz o P2002 do banco (corrida entre duas requests) em 409 (CA-38)', async () => {
      const { service, game } = setup();
      game.findFirst.mockResolvedValue(null);
      game.create.mockRejectedValue(prismaError('P2002'));

      const error = await failure(service.create({ titulo: 'Celeste', status: 'ZERADO' }));

      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({ fields: { titulo: DUPLICATE } });
    });

    it('nao engole erros inesperados do banco', async () => {
      const { service, game } = setup();
      game.findFirst.mockResolvedValue(null);
      game.create.mockRejectedValue(new Error('conexao perdida'));

      await expect(service.create({ titulo: 'Celeste', status: 'ZERADO' })).rejects.toThrow(
        'conexao perdida',
      );
    });
  });

  describe('update', () => {
    it('rejeita body vazio com 400 antes de consultar o banco (CA-24)', async () => {
      const { service, game } = setup();

      const error = await failure(service.update(ID, {}));

      expect(error.getStatus()).toBe(400);
      expect(game.findUnique).not.toHaveBeenCalled();
    });

    it('trata campos undefined como ausentes (CA-24)', async () => {
      const { service } = setup();

      const error = await failure(service.update(ID, { titulo: undefined, nota: undefined }));

      expect(error.getStatus()).toBe(400);
    });

    it('devolve 404 quando o jogo nao existe (CA-27)', async () => {
      const { service, game } = setup();
      game.findUnique.mockResolvedValue(null);

      const error = await failure(service.update(ID, { titulo: 'X' }));

      expect(error.getStatus()).toBe(404);
      expect(error.getResponse()).toMatchObject({ message: 'Jogo não encontrado' });
      expect(game.update).not.toHaveBeenCalled();
    });

    it('troca so o status e mantem os demais campos (CA-08, CA-09)', async () => {
      const { service, game } = setup();
      game.findUnique.mockResolvedValue(row({ status: 'QUERO_JOGAR', nota: null }));
      game.findFirst.mockResolvedValue(null);
      game.update.mockResolvedValue(row({ status: 'JOGANDO', nota: null }));

      await service.update(ID, { status: 'JOGANDO' });

      expect(game.update).toHaveBeenCalledWith({
        where: { id: ID },
        data: {
          titulo: 'Celeste',
          plataforma: 'PC',
          status: 'JOGANDO',
          nota: null,
          tituloNormalizado: 'celeste',
          plataformaNormalizada: 'pc',
        },
      });
    });

    describe('regra da nota sobre o estado final', () => {
      it('rejeita { status: QUERO_JOGAR } num jogo que ja tem nota, sem gravar (CA-21)', async () => {
        const { service, game } = setup();
        game.findUnique.mockResolvedValue(row({ status: 'JOGANDO', nota: 7 }));

        const error = await failure(service.update(ID, { status: 'QUERO_JOGAR' }));

        expect(error.getStatus()).toBe(400);
        expect(error.getResponse()).toEqual({
          statusCode: 400,
          message: RATING,
          fields: { nota: RATING },
        });
        expect(game.update).not.toHaveBeenCalled();
      });

      it('aceita { status: QUERO_JOGAR, nota: null } no mesmo body (CA-10)', async () => {
        const { service, game } = setup();
        game.findUnique.mockResolvedValue(row({ status: 'JOGANDO', nota: 7 }));
        game.findFirst.mockResolvedValue(null);
        game.update.mockResolvedValue(row({ status: 'QUERO_JOGAR', nota: null }));

        await service.update(ID, { status: 'QUERO_JOGAR', nota: null });

        expect(game.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'QUERO_JOGAR', nota: null }),
          }),
        );
      });

      it('rejeita { nota: 5 } num jogo QUERO_JOGAR sem nota (CA-22)', async () => {
        const { service, game } = setup();
        game.findUnique.mockResolvedValue(row({ status: 'QUERO_JOGAR', nota: null }));

        const error = await failure(service.update(ID, { nota: 5 }));

        expect(error.getResponse()).toMatchObject({ fields: { nota: RATING } });
        expect(game.update).not.toHaveBeenCalled();
      });

      it('aceita { status: ZERADO, nota: 5 } num jogo QUERO_JOGAR (CA-23)', async () => {
        const { service, game } = setup();
        game.findUnique.mockResolvedValue(row({ status: 'QUERO_JOGAR', nota: null }));
        game.findFirst.mockResolvedValue(null);
        game.update.mockResolvedValue(row({ status: 'ZERADO', nota: 5 }));

        await service.update(ID, { status: 'ZERADO', nota: 5 });

        expect(game.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ status: 'ZERADO', nota: 5 }) }),
        );
      });

      it('aceita mudar so a nota quando o status continua permitindo nota', async () => {
        const { service, game } = setup();
        game.findUnique.mockResolvedValue(row({ status: 'JOGANDO', nota: 7 }));
        game.findFirst.mockResolvedValue(null);
        game.update.mockResolvedValue(row({ status: 'JOGANDO', nota: 8 }));

        await service.update(ID, { nota: 8 });

        expect(game.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'JOGANDO', nota: 8 }),
          }),
        );
      });
    });

    it('remove a plataforma com plataforma: null (CA-11)', async () => {
      const { service, game } = setup();
      game.findUnique.mockResolvedValue(row());
      game.findFirst.mockResolvedValue(null);
      game.update.mockResolvedValue(row({ plataforma: '', plataformaNormalizada: '' }));

      const result = await service.update(ID, { plataforma: null });

      expect(game.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ plataforma: '', plataformaNormalizada: '' }),
        }),
      );
      expect(result.plataforma).toBeNull();
    });

    it('recalcula as chaves de unicidade a partir do estado final (so o titulo mudou)', async () => {
      const { service, game } = setup();
      game.findUnique.mockResolvedValue(row({ titulo: 'Celeste', plataforma: 'PC' }));
      game.findFirst.mockResolvedValue(null);
      game.update.mockResolvedValue(row());

      await service.update(ID, { titulo: '  CELESTE 2 ' });

      expect(game.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            titulo: 'CELESTE 2',
            tituloNormalizado: 'celeste 2',
            plataformaNormalizada: 'pc',
          }),
        }),
      );
    });

    it('devolve 409 quando a edicao duplica OUTRO jogo (CA-34)', async () => {
      const { service, game } = setup();
      game.findUnique.mockResolvedValue(row({ titulo: 'Hades', plataforma: 'PC' }));
      game.findFirst.mockResolvedValue({ id: 'celeste' });

      const error = await failure(service.update(ID, { titulo: 'celeste' }));

      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({ fields: { titulo: DUPLICATE } });
      expect(game.update).not.toHaveBeenCalled();
    });

    it('nao conta o proprio jogo como duplicata: a checagem exclui o id editado (CA-35)', async () => {
      const { service, game } = setup();
      game.findUnique.mockResolvedValue(row());
      game.findFirst.mockResolvedValue(null);
      game.update.mockResolvedValue(row({ titulo: 'CELESTE' }));

      await service.update(ID, { titulo: 'CELESTE' });

      expect(game.findFirst).toHaveBeenCalledWith({
        where: { tituloNormalizado: 'celeste', plataformaNormalizada: 'pc', id: { not: ID } },
        select: { id: true },
      });
      expect(game.update).toHaveBeenCalled();
    });

    it('traduz o P2002 do update em 409 (CA-38)', async () => {
      const { service, game } = setup();
      game.findUnique.mockResolvedValue(row());
      game.findFirst.mockResolvedValue(null);
      game.update.mockRejectedValue(prismaError('P2002'));

      const error = await failure(service.update(ID, { titulo: 'Outro' }));

      expect(error.getStatus()).toBe(409);
    });

    it('traduz o P2025 do update (jogo removido no meio) em 404', async () => {
      const { service, game } = setup();
      game.findUnique.mockResolvedValue(row());
      game.findFirst.mockResolvedValue(null);
      game.update.mockRejectedValue(prismaError('P2025'));

      const error = await failure(service.update(ID, { titulo: 'Outro' }));

      expect(error.getStatus()).toBe(404);
    });
  });

  describe('remove', () => {
    it('apaga o jogo pelo id (CA-12)', async () => {
      const { service, game } = setup();
      game.delete.mockResolvedValue(row());

      await expect(service.remove(ID)).resolves.toBeUndefined();

      expect(game.delete).toHaveBeenCalledWith({ where: { id: ID } });
    });

    it('devolve 404 quando o jogo nao existe ou ja foi removido (CA-28, CA-29)', async () => {
      const { service, game } = setup();
      game.delete.mockRejectedValue(prismaError('P2025'));

      const error = await failure(service.remove(ID));

      expect(error.getStatus()).toBe(404);
      expect(error.getResponse()).toMatchObject({ message: 'Jogo não encontrado' });
    });

    it('nao engole erros inesperados do banco', async () => {
      const { service, game } = setup();
      game.delete.mockRejectedValue(new Error('conexao perdida'));

      await expect(service.remove(ID)).rejects.toThrow('conexao perdida');
    });
  });
});
