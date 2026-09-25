import { HttpException } from '@nestjs/common';
import { Prisma, type Game as GameRow } from '@prisma/client';
import { type PrismaService } from '../../database/prisma.service';
import { type StorageService } from './cover/storage.service';
import { GamesService, DADOS_PLATAFORMA_INCLUDE } from './games.service';

const ID = '3f2b8a52-9c1e-4d6a-8f31-0a7e5b2c9d44';
/** Dono de todos os jogos destes testes. */
const USER = '0b6c1f7e-2a3d-4e5f-8a9b-1c2d3e4f5a6b';
const DUPLICATE = 'Já existe esse jogo nesta plataforma';
const RATINGS = 'Notas só podem ser preenchidas quando o status é Zerado ou Jogando';
const ZERADO_NEEDS = 'Preencha ao menos um critério para marcar como Zerado';

/** As cinco notas nulas (em décimos), para os jogos e gravações sem avaliação. */
const SEM_NOTAS = {
  notaGameplay: null,
  notaHistoria: null,
  notaGraficos: null,
  notaTrilhaSonora: null,
  notaPerformance: null,
};

function row(overrides: Partial<GameRow> = {}): GameRow {
  return {
    id: ID,
    userId: USER,
    titulo: 'Celeste',
    plataforma: 'PC',
    status: 'ZERADO',
    ...SEM_NOTAS,
    notaGameplay: 90,
    descricao: null,
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
    it('lista os jogos do dono ordenando por atualizadoEm e depois criadoEm, ambos decrescentes (CA-05, CA-42)', async () => {
      const { service, game } = setup();
      game.findMany.mockResolvedValue([row()]);

      await service.list(USER);

      expect(game.findMany).toHaveBeenCalledWith({
        where: { userId: USER },
        orderBy: [{ atualizadoEm: 'desc' }, { criadoEm: 'desc' }],
        include: DADOS_PLATAFORMA_INCLUDE,
      });
    });

    it('filtra por status quando informado (CA-06)', async () => {
      const { service, game } = setup();
      game.findMany.mockResolvedValue([]);

      await service.list(USER, 'JOGANDO');

      expect(game.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER, status: 'JOGANDO' } }),
      );
    });

    it('devolve [] quando nao ha jogos (CA-07)', async () => {
      const { service, game } = setup();
      game.findMany.mockResolvedValue([]);

      await expect(service.list(USER, 'ZERADO')).resolves.toEqual([]);
    });

    it('expoe plataforma vazia como null e nao vaza as colunas normalizadas (CA-01, CA-04)', async () => {
      const { service, game } = setup();
      game.findMany.mockResolvedValue([
        row({ plataforma: '', plataformaNormalizada: '', ...SEM_NOTAS }),
      ]);

      const [result] = await service.list(USER);

      expect(result).toEqual({
        id: ID,
        titulo: 'Celeste',
        plataforma: null,
        status: 'ZERADO',
        notas: {
          gameplay: null,
          historia: null,
          graficos: null,
          trilhaSonora: null,
          performance: null,
        },
        notaMedia: null,
        descricao: null,
        capaUrl: null,
        criadoEm: '2026-09-23T12:00:00.000Z',
        atualizadoEm: '2026-09-23T13:00:00.000Z',
        dadosPlataforma: [],
      });
      expect(result).not.toHaveProperty('tituloNormalizado');
      expect(result).not.toHaveProperty('plataformaNormalizada');
      expect(result).not.toHaveProperty('userId');
    });
  });

  describe('create', () => {
    it('grava titulo e plataforma aparados, com as chaves de unicidade em minusculas (CA-03, CA-31)', async () => {
      const { service, game } = setup();
      game.findFirst.mockResolvedValue(null);
      game.create.mockResolvedValue(row());

      await service.create(USER, {
        titulo: '  Outer Wilds  ',
        status: 'QUERO_JOGAR',
        plataforma: ' PC ',
      });

      expect(game.create).toHaveBeenCalledWith({
        data: {
          userId: USER,
          titulo: 'Outer Wilds',
          plataforma: 'PC',
          status: 'QUERO_JOGAR',
          ...SEM_NOTAS,
          descricao: null,
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
        await service.create(USER, { titulo: 'Hades', status: 'JOGANDO', plataforma });

        expect(game.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ plataforma: '', plataformaNormalizada: '' }),
        });
      }
    });

    it('grava as notas em decimos: 9 -> 90 e 8,5 -> 85 (CA-01)', async () => {
      const { service, game } = setup();
      game.findFirst.mockResolvedValue(null);
      game.create.mockResolvedValue(row());

      await service.create(USER, {
        titulo: 'Celeste',
        status: 'ZERADO',
        gameplay: 9,
        historia: 8.5,
      });

      expect(game.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ...SEM_NOTAS,
          notaGameplay: 90,
          notaHistoria: 85,
        }),
      });
    });

    it('os cinco critérios juntos: cada um na sua coluna, em décimos, e a média de 7,1 na resposta (CA-09)', async () => {
      const { service, game } = setup();
      game.findFirst.mockResolvedValue(null);
      game.create.mockImplementation(({ data }: { data: Partial<GameRow> }) =>
        Promise.resolve(row({ ...data, status: 'JOGANDO' })),
      );

      const result = await service.create(USER, {
        titulo: 'Hades',
        status: 'JOGANDO',
        gameplay: 10,
        historia: 9.9,
        graficos: 8,
        trilhaSonora: 7.5,
        performance: 0,
      });

      expect(game.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          notaGameplay: 100,
          notaHistoria: 99,
          notaGraficos: 80,
          notaTrilhaSonora: 75,
          notaPerformance: 0,
        }),
      });
      // (10 + 9,9 + 8 + 7,5 + 0) / 5 = 7,08 -> 7,1; o 0 entra na média.
      expect(result.notaMedia).toBe(7.1);
      expect(result.notas).toEqual({
        gameplay: 10,
        historia: 9.9,
        graficos: 8,
        trilhaSonora: 7.5,
        performance: 0,
      });
    });

    it('7,3 vira 73 sem erro de ponto flutuante (CA-04)', async () => {
      const { service, game } = setup();
      game.findFirst.mockResolvedValue(null);
      game.create.mockResolvedValue(row());

      await service.create(USER, { titulo: 'Hades', status: 'JOGANDO', graficos: 7.3 });

      expect(game.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ notaGraficos: 73 }),
      });
    });

    it('aceita 0 como nota: e uma nota, nao "sem nota" (CA-03)', async () => {
      const { service, game } = setup();
      game.findFirst.mockResolvedValue(null);
      game.create.mockResolvedValue(row());

      await service.create(USER, { titulo: 'Tetris', status: 'JOGANDO', gameplay: 0 });

      expect(game.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ notaGameplay: 0, notaHistoria: null }),
      });
    });

    it('aceita JOGANDO sem nenhum critério (CA-02)', async () => {
      const { service, game } = setup();
      game.findFirst.mockResolvedValue(null);
      game.create.mockResolvedValue(row());

      await service.create(USER, { titulo: 'Hades', status: 'JOGANDO' });

      expect(game.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ ...SEM_NOTAS, descricao: null }),
      });
    });

    it('rejeita nota com QUERO_JOGAR: 400 em fields.<critério> e nao cria nada (CA-05)', async () => {
      const { service, game } = setup();

      const error = await failure(
        service.create(USER, { titulo: 'Hades', status: 'QUERO_JOGAR', historia: 8 }),
      );

      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toEqual({
        statusCode: 400,
        message: RATINGS,
        fields: { historia: RATINGS },
      });
      expect(game.create).not.toHaveBeenCalled();
    });

    it('aponta cada critério preenchido quando QUERO_JOGAR traz varias notas', async () => {
      const { service } = setup();

      const error = await failure(
        service.create(USER, {
          titulo: 'Hades',
          status: 'QUERO_JOGAR',
          gameplay: 1,
          performance: 0,
        }),
      );

      expect(error.getResponse()).toMatchObject({
        fields: { gameplay: RATINGS, performance: RATINGS },
      });
    });

    it('aceita todas as notas null com QUERO_JOGAR', async () => {
      const { service, game } = setup();
      game.findFirst.mockResolvedValue(null);
      game.create.mockResolvedValue(row());

      await service.create(USER, {
        titulo: 'Hades',
        status: 'QUERO_JOGAR',
        gameplay: null,
        historia: null,
      });

      expect(game.create).toHaveBeenCalledWith({
        data: expect.objectContaining(SEM_NOTAS),
      });
    });

    it('rejeita ZERADO sem nenhum critério: fields.notas, e nao cria (CA-08)', async () => {
      const { service, game } = setup();

      const error = await failure(service.create(USER, { titulo: 'Hades', status: 'ZERADO' }));

      expect(error.getStatus()).toBe(400);
      expect(error.getResponse()).toEqual({
        statusCode: 400,
        message: ZERADO_NEEDS,
        fields: { notas: ZERADO_NEEDS },
      });
      expect(game.create).not.toHaveBeenCalled();
    });

    it('descrição: aparada pelo service; vazia, só espaços ou null viram null (CA-11)', async () => {
      const { service, game } = setup();
      game.findFirst.mockResolvedValue(null);
      game.create.mockResolvedValue(row());

      for (const [entrada, gravado] of [
        ['Ótimo\n\njogo', 'Ótimo\n\njogo'],
        ['  Ótimo  ', 'Ótimo'],
        ['', null],
        ['   ', null],
        [null, null],
        [undefined, null],
      ] as const) {
        game.create.mockClear();
        await service.create(USER, { titulo: 'Hades', status: 'JOGANDO', descricao: entrada });

        expect(game.create).toHaveBeenCalledWith({
          data: expect.objectContaining({ descricao: gravado }),
        });
      }
    });

    it('devolve 409 com fields.titulo quando a checagem previa acha duplicata e nao cria (CA-30, CA-31, CA-33)', async () => {
      const { service, game } = setup();
      game.findFirst.mockResolvedValue({ id: 'outro' });

      const error = await failure(
        service.create(USER, {
          titulo: '  cELESTE ',
          status: 'ZERADO',
          gameplay: 9,
          plataforma: 'pc ',
        }),
      );

      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toEqual({
        statusCode: 409,
        message: DUPLICATE,
        fields: { titulo: DUPLICATE },
      });
      expect(game.findFirst).toHaveBeenCalledWith({
        where: { userId: USER, tituloNormalizado: 'celeste', plataformaNormalizada: 'pc' },
        select: { id: true },
      });
      expect(game.create).not.toHaveBeenCalled();
    });

    it('compara duplicata com plataforma "" quando o jogo nao tem plataforma (CA-33)', async () => {
      const { service, game } = setup();
      game.findFirst.mockResolvedValue({ id: 'outro' });

      await failure(
        service.create(USER, {
          titulo: 'celeste',
          status: 'ZERADO',
          gameplay: 9,
          plataforma: '   ',
        }),
      );

      expect(game.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: USER, tituloNormalizado: 'celeste', plataformaNormalizada: '' },
        }),
      );
    });

    it('a duplicata e por dono: outro usuario com o mesmo jogo nao conflita (CA-43)', async () => {
      const { service, game } = setup();
      const OTHER = '9e8d7c6b-5a4f-4e3d-9c2b-1a0f9e8d7c6b';
      // "Celeste / PC" existe so para USER.
      game.findFirst.mockImplementation(({ where }: { where: { userId: string } }) =>
        Promise.resolve(where.userId === USER ? { id: ID } : null),
      );
      game.create.mockResolvedValue(row({ userId: OTHER }));

      await expect(
        service.create(OTHER, {
          titulo: 'celeste',
          status: 'ZERADO',
          gameplay: 9,
          plataforma: 'pc',
        }),
      ).resolves.toMatchObject({ id: ID });
      const error = await failure(
        service.create(USER, {
          titulo: 'CELESTE',
          status: 'ZERADO',
          gameplay: 9,
          plataforma: 'PC',
        }),
      );

      expect(error.getStatus()).toBe(409);
      expect(game.create).toHaveBeenCalledTimes(1);
      expect(game.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: OTHER }),
      });
    });

    it('traduz o P2002 do banco (corrida entre duas requests) em 409 (CA-38)', async () => {
      const { service, game } = setup();
      game.findFirst.mockResolvedValue(null);
      game.create.mockRejectedValue(prismaError('P2002'));

      const error = await failure(
        service.create(USER, { titulo: 'Celeste', status: 'ZERADO', gameplay: 9 }),
      );

      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({ fields: { titulo: DUPLICATE } });
    });

    it('nao engole erros inesperados do banco', async () => {
      const { service, game } = setup();
      game.findFirst.mockResolvedValue(null);
      game.create.mockRejectedValue(new Error('conexao perdida'));

      await expect(
        service.create(USER, { titulo: 'Celeste', status: 'ZERADO', gameplay: 9 }),
      ).rejects.toThrow('conexao perdida');
    });
  });

  describe('update', () => {
    it('rejeita body vazio com 400 antes de consultar o banco (CA-24)', async () => {
      const { service, game } = setup();

      const error = await failure(service.update(USER, ID, {}));

      expect(error.getStatus()).toBe(400);
      expect(game.findUnique).not.toHaveBeenCalled();
    });

    it('trata campos undefined como ausentes (CA-24)', async () => {
      const { service } = setup();

      const error = await failure(
        service.update(USER, ID, { titulo: undefined, gameplay: undefined }),
      );

      expect(error.getStatus()).toBe(400);
    });

    it('devolve 404 quando o jogo nao existe ou e de outro usuario: busca pelo id E pelo dono (CA-27, CA-42)', async () => {
      const { service, game } = setup();
      game.findUnique.mockResolvedValue(null);

      const error = await failure(service.update(USER, ID, { titulo: 'X' }));

      expect(error.getStatus()).toBe(404);
      expect(error.getResponse()).toMatchObject({ message: 'Jogo não encontrado' });
      expect(game.findUnique).toHaveBeenCalledWith({
        where: { id: ID, userId: USER },
        include: DADOS_PLATAFORMA_INCLUDE,
      });
      expect(game.findFirst).not.toHaveBeenCalled();
      expect(game.update).not.toHaveBeenCalled();
    });

    it('troca so o status e mantem os demais campos (CA-08, CA-09)', async () => {
      const { service, game } = setup();
      game.findUnique.mockResolvedValue(row({ status: 'QUERO_JOGAR', ...SEM_NOTAS }));
      game.findFirst.mockResolvedValue(null);
      game.update.mockResolvedValue(row({ status: 'JOGANDO', ...SEM_NOTAS }));

      await service.update(USER, ID, { status: 'JOGANDO' });

      expect(game.update).toHaveBeenCalledWith({
        where: { id: ID, userId: USER },
        data: {
          titulo: 'Celeste',
          plataforma: 'PC',
          status: 'JOGANDO',
          ...SEM_NOTAS,
          descricao: null,
          tituloNormalizado: 'celeste',
          plataformaNormalizada: 'pc',
        },
        include: DADOS_PLATAFORMA_INCLUDE,
      });
    });

    describe('regras das notas sobre o estado final', () => {
      it('rejeita { status: QUERO_JOGAR } num jogo que ja tem nota, sem gravar (CA-06)', async () => {
        const { service, game } = setup();
        game.findUnique.mockResolvedValue(
          row({ status: 'JOGANDO', ...SEM_NOTAS, notaGameplay: 70 }),
        );

        const error = await failure(service.update(USER, ID, { status: 'QUERO_JOGAR' }));

        expect(error.getStatus()).toBe(400);
        expect(error.getResponse()).toEqual({
          statusCode: 400,
          message: RATINGS,
          fields: { gameplay: RATINGS },
        });
        expect(game.update).not.toHaveBeenCalled();
      });

      it('aceita { status: QUERO_JOGAR } com todas as notas preenchidas null no mesmo body (CA-06)', async () => {
        const { service, game } = setup();
        game.findUnique.mockResolvedValue(
          row({ status: 'JOGANDO', ...SEM_NOTAS, notaGameplay: 70 }),
        );
        game.findFirst.mockResolvedValue(null);
        game.update.mockResolvedValue(row({ status: 'QUERO_JOGAR', ...SEM_NOTAS }));

        await service.update(USER, ID, { status: 'QUERO_JOGAR', gameplay: null });

        expect(game.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'QUERO_JOGAR', ...SEM_NOTAS }),
          }),
        );
      });

      it('rejeita { graficos: 5 } num jogo QUERO_JOGAR sem notas (CA-07)', async () => {
        const { service, game } = setup();
        game.findUnique.mockResolvedValue(row({ status: 'QUERO_JOGAR', ...SEM_NOTAS }));

        const error = await failure(service.update(USER, ID, { graficos: 5 }));

        expect(error.getResponse()).toMatchObject({ fields: { graficos: RATINGS } });
        expect(game.update).not.toHaveBeenCalled();
      });

      it('aceita { status: ZERADO, historia: 6 } num jogo QUERO_JOGAR (CA-08)', async () => {
        const { service, game } = setup();
        game.findUnique.mockResolvedValue(row({ status: 'QUERO_JOGAR', ...SEM_NOTAS }));
        game.findFirst.mockResolvedValue(null);
        game.update.mockResolvedValue(row({ status: 'ZERADO', ...SEM_NOTAS, notaHistoria: 60 }));

        const result = await service.update(USER, ID, { status: 'ZERADO', historia: 6 });

        expect(game.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'ZERADO', notaHistoria: 60 }),
          }),
        );
        expect(result.notaMedia).toBe(6);
      });

      it('aceita mudar so uma nota (7,3) quando o status continua permitindo nota', async () => {
        const { service, game } = setup();
        game.findUnique.mockResolvedValue(
          row({ status: 'JOGANDO', ...SEM_NOTAS, notaGameplay: 70 }),
        );
        game.findFirst.mockResolvedValue(null);
        game.update.mockResolvedValue(row({ status: 'JOGANDO', ...SEM_NOTAS, notaGameplay: 73 }));

        await service.update(USER, ID, { gameplay: 7.3 });

        expect(game.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ status: 'JOGANDO', notaGameplay: 73 }),
          }),
        );
      });

      it('null limpa um critério e a média se recalcula só com os restantes (CA-10)', async () => {
        const { service, game } = setup();
        const cinco = {
          notaGameplay: 100,
          notaHistoria: 99,
          notaGraficos: 80,
          notaTrilhaSonora: 75,
        };
        game.findUnique.mockResolvedValue(row({ status: 'JOGANDO', ...cinco, notaPerformance: 0 }));
        game.findFirst.mockResolvedValue(null);
        game.update.mockResolvedValue(
          row({ status: 'JOGANDO', ...cinco, notaGameplay: null, notaPerformance: 0 }),
        );

        const result = await service.update(USER, ID, { gameplay: null });

        expect(game.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ notaGameplay: null, notaHistoria: 99 }),
          }),
        );
        // (9,9 + 8 + 7,5 + 0) / 4 = 6,35 -> 6,4
        expect(result.notaMedia).toBe(6.4);
        expect(result.notas.gameplay).toBeNull();
      });

      it('limpar o unico critério de um ZERADO e 400 com fields.notas (CA-10)', async () => {
        const { service, game } = setup();
        game.findUnique.mockResolvedValue(
          row({ status: 'ZERADO', ...SEM_NOTAS, notaHistoria: 60 }),
        );

        const error = await failure(service.update(USER, ID, { historia: null }));

        expect(error.getResponse()).toEqual({
          statusCode: 400,
          message: ZERADO_NEEDS,
          fields: { notas: ZERADO_NEEDS },
        });
        expect(game.update).not.toHaveBeenCalled();
      });

      describe('Zerado sem critérios (os jogos que já existiam) continua editavel (CA-32)', () => {
        it('editar so o titulo devolve 200', async () => {
          const { service, game } = setup();
          game.findUnique.mockResolvedValue(row({ status: 'ZERADO', ...SEM_NOTAS }));
          game.findFirst.mockResolvedValue(null);
          game.update.mockResolvedValue(
            row({ status: 'ZERADO', ...SEM_NOTAS, titulo: 'Novo nome' }),
          );

          const result = await service.update(USER, ID, { titulo: 'Novo nome' });

          expect(result.titulo).toBe('Novo nome');
          expect(game.update).toHaveBeenCalledTimes(1);
        });

        it('o corpo completo do formulario, com os criterios null que ja estavam null, passa', async () => {
          const { service, game } = setup();
          game.findUnique.mockResolvedValue(row({ status: 'ZERADO', ...SEM_NOTAS }));
          game.findFirst.mockResolvedValue(null);
          game.update.mockResolvedValue(
            row({ status: 'ZERADO', ...SEM_NOTAS, titulo: 'Novo nome' }),
          );

          await service.update(USER, ID, {
            titulo: 'Novo nome',
            status: 'ZERADO',
            plataforma: 'PC',
            gameplay: null,
            historia: null,
            graficos: null,
            trilhaSonora: null,
            performance: null,
            descricao: null,
          });

          expect(game.update).toHaveBeenCalledTimes(1);
        });

        it('mas virar ZERADO sem critério (vindo de JOGANDO) continua sendo 400', async () => {
          const { service, game } = setup();
          game.findUnique.mockResolvedValue(row({ status: 'JOGANDO', ...SEM_NOTAS }));

          const error = await failure(service.update(USER, ID, { status: 'ZERADO' }));

          expect(error.getResponse()).toMatchObject({ fields: { notas: ZERADO_NEEDS } });
          expect(game.update).not.toHaveBeenCalled();
        });
      });

      it('descricao: aparada, vazia vira null, e ausente mantem a gravada', async () => {
        const { service, game } = setup();
        game.findUnique.mockResolvedValue(row({ descricao: 'Antiga' }));
        game.findFirst.mockResolvedValue(null);
        game.update.mockResolvedValue(row());

        await service.update(USER, ID, { descricao: '  Nova\n\ndescricao ' });
        expect(game.update).toHaveBeenLastCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ descricao: 'Nova\n\ndescricao' }),
          }),
        );

        await service.update(USER, ID, { descricao: '   ' });
        expect(game.update).toHaveBeenLastCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ descricao: null }) }),
        );

        await service.update(USER, ID, { titulo: 'Celeste' });
        expect(game.update).toHaveBeenLastCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ descricao: 'Antiga' }) }),
        );
      });
    });

    it('remove a plataforma com plataforma: null (CA-11)', async () => {
      const { service, game } = setup();
      game.findUnique.mockResolvedValue(row());
      game.findFirst.mockResolvedValue(null);
      game.update.mockResolvedValue(row({ plataforma: '', plataformaNormalizada: '' }));

      const result = await service.update(USER, ID, { plataforma: null });

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

      await service.update(USER, ID, { titulo: '  CELESTE 2 ' });

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

      const error = await failure(service.update(USER, ID, { titulo: 'celeste' }));

      expect(error.getStatus()).toBe(409);
      expect(error.getResponse()).toMatchObject({ fields: { titulo: DUPLICATE } });
      expect(game.update).not.toHaveBeenCalled();
    });

    it('nao conta o proprio jogo como duplicata: a checagem exclui o id editado (CA-35)', async () => {
      const { service, game } = setup();
      game.findUnique.mockResolvedValue(row());
      game.findFirst.mockResolvedValue(null);
      game.update.mockResolvedValue(row({ titulo: 'CELESTE' }));

      await service.update(USER, ID, { titulo: 'CELESTE' });

      expect(game.findFirst).toHaveBeenCalledWith({
        where: {
          userId: USER,
          tituloNormalizado: 'celeste',
          plataformaNormalizada: 'pc',
          id: { not: ID },
        },
        select: { id: true },
      });
      expect(game.update).toHaveBeenCalled();
    });

    it('traduz o P2002 do update em 409 (CA-38)', async () => {
      const { service, game } = setup();
      game.findUnique.mockResolvedValue(row());
      game.findFirst.mockResolvedValue(null);
      game.update.mockRejectedValue(prismaError('P2002'));

      const error = await failure(service.update(USER, ID, { titulo: 'Outro' }));

      expect(error.getStatus()).toBe(409);
    });

    it('traduz o P2025 do update (jogo removido no meio) em 404', async () => {
      const { service, game } = setup();
      game.findUnique.mockResolvedValue(row());
      game.findFirst.mockResolvedValue(null);
      game.update.mockRejectedValue(prismaError('P2025'));

      const error = await failure(service.update(USER, ID, { titulo: 'Outro' }));

      expect(error.getStatus()).toBe(404);
    });
  });

  describe('remove', () => {
    it('apaga o jogo pelo id e pelo dono (CA-12, CA-42)', async () => {
      const { service, game } = setup();
      game.delete.mockResolvedValue(row());

      await expect(service.remove(USER, ID)).resolves.toBeUndefined();

      expect(game.delete).toHaveBeenCalledWith({ where: { id: ID, userId: USER } });
    });

    it('devolve 404 quando o jogo nao existe, ja foi removido ou e de outro usuario (CA-28, CA-29, CA-42)', async () => {
      const { service, game } = setup();
      game.delete.mockRejectedValue(prismaError('P2025'));

      const error = await failure(service.remove(USER, ID));

      expect(error.getStatus()).toBe(404);
      expect(error.getResponse()).toMatchObject({ message: 'Jogo não encontrado' });
    });

    it('nao engole erros inesperados do banco', async () => {
      const { service, game } = setup();
      game.delete.mockRejectedValue(new Error('conexao perdida'));

      await expect(service.remove(USER, ID)).rejects.toThrow('conexao perdida');
    });
  });
});

describe('GamesService — dadosPlataforma (CA-40)', () => {
  const linhaDaPlataforma = {
    provedor: 'STEAM' as const,
    idExterno: '504230',
    minutosJogados: 90,
    ultimaVezJogadoEm: new Date('2026-02-01T00:00:00Z'),
    conquistasTotal: 40,
    conquistasDesbloqueadas: 12,
    capaUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/504230/library_600x900.jpg',
    atualizadoEm: new Date('2026-09-25T12:00:00Z'),
  };

  it('o jogo ligado traz a camada da plataforma; o outro traz [] (só o que já está gravado)', async () => {
    const { service, game } = setup();
    game.findMany.mockResolvedValue([
      // Colunas que NUNCA saem (userId, gameId, id da linha) vêm no mock de propósito.
      {
        ...row({ id: 'ligado' }),
        dadosPlataforma: [{ ...linhaDaPlataforma, userId: USER, gameId: 'ligado', id: 'interno' }],
      },
      row({ id: 'sem-vinculo' }),
    ]);

    const [ligado, semVinculo] = await service.list(USER);

    expect(ligado?.dadosPlataforma).toEqual([
      {
        provedor: 'STEAM',
        idExterno: '504230',
        minutosJogados: 90,
        ultimaVezJogadoEm: '2026-02-01T00:00:00.000Z',
        conquistasTotal: 40,
        conquistasDesbloqueadas: 12,
        capaUrl: 'https://cdn.cloudflare.steamstatic.com/steam/apps/504230/library_600x900.jpg',
        atualizadoEm: '2026-09-25T12:00:00.000Z',
      },
    ]);
    expect(semVinculo?.dadosPlataforma).toEqual([]);
    expect(JSON.stringify(ligado)).not.toContain('interno');
    expect(JSON.stringify(ligado)).not.toContain('gameId');
  });

  it('lê a camada na mesma consulta, só das colunas do contrato, sem consultar mais nada', async () => {
    const { service, game } = setup();
    game.findMany.mockResolvedValue([]);

    await service.list(USER);

    expect(game.findMany).toHaveBeenCalledTimes(1);
    expect(game.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          dadosPlataforma: {
            select: {
              provedor: true,
              idExterno: true,
              minutosJogados: true,
              ultimaVezJogadoEm: true,
              conquistasTotal: true,
              conquistasDesbloqueadas: true,
              capaUrl: true,
              atualizadoEm: true,
            },
            orderBy: { provedor: 'asc' },
          },
        },
      }),
    );
  });

  it('conquistas null (negadas ou nunca consultadas) e última vez jogado null passam como null', async () => {
    const { service, game } = setup();
    game.findMany.mockResolvedValue([
      {
        ...row(),
        dadosPlataforma: [
          {
            ...linhaDaPlataforma,
            conquistasTotal: null,
            conquistasDesbloqueadas: null,
            ultimaVezJogadoEm: null,
          },
        ],
      },
    ]);

    const [jogo] = await service.list(USER);

    expect(jogo?.dadosPlataforma[0]).toMatchObject({
      conquistasTotal: null,
      conquistasDesbloqueadas: null,
      ultimaVezJogadoEm: null,
    });
  });

  it('o PATCH devolve a camada também (o formulário edita o jogo salvo)', async () => {
    const { service, game } = setup();
    game.findUnique.mockResolvedValue(row());
    game.findFirst.mockResolvedValue(null);
    game.update.mockResolvedValue({
      ...row({ titulo: 'Celeste 2' }),
      dadosPlataforma: [linhaDaPlataforma],
    });

    const atualizado = await service.update(USER, ID, { titulo: 'Celeste 2' });

    expect(atualizado.dadosPlataforma).toHaveLength(1);
  });

  it('um jogo recém-criado não tem camada: []', async () => {
    const { service, game } = setup();
    game.findFirst.mockResolvedValue(null);
    game.create.mockResolvedValue(row());

    const criado = await service.create(USER, {
      titulo: 'Celeste',
      status: 'JOGANDO',
      plataforma: 'PC',
    });

    expect(criado.dadosPlataforma).toEqual([]);
  });
});
