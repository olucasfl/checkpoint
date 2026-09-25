import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type PrismaService } from '../../database/prisma.service';
import { type PasswordHasher } from '../auth/password-hasher';
import { fakeHasher } from '../auth/testing/fake-auth-prisma';
import { type StorageService } from '../games/cover/storage.service';
import { GamesService } from '../games/games.service';
import { USUARIO_PUBLICO_SELECT } from './usuario-publico';
import { UsersService } from './users.service';

// PrismaService e StorageService mockados como objetos simples de funções (RULES.md §5): nenhum
// teste toca o banco nem o bucket. O GamesService é o de verdade, para a exclusão exercitar o
// caminho real até o storage.
function setup() {
  const update = jest.fn();
  const user = { update, findUnique: jest.fn(), delete: jest.fn() };
  const game = { findMany: jest.fn() };
  const storage = { remove: jest.fn(), upload: jest.fn(), publicUrl: jest.fn() };
  const prisma = { user, game } as unknown as PrismaService;
  const games = new GamesService(prisma, storage as unknown as StorageService);
  const service = new UsersService(prisma, fakeHasher as unknown as PasswordHasher, games);
  return { service, update, user, game, storage };
}

function recordNotFound() {
  return new Prisma.PrismaClientKnownRequestError('Record not found', {
    code: 'P2025',
    clientVersion: 'teste',
  });
}

const ROW = {
  id: '3f2b8a52-9c1e-4d6a-8f31-0a7e5b2c9d44',
  nome: 'Ana Souza',
  email: 'ana@exemplo.com',
  criadoEm: new Date('2026-09-24T12:00:00.000Z'),
};

async function errorOf(promise: Promise<unknown>): Promise<{ status: number; body: unknown }> {
  try {
    await promise;
  } catch (error) {
    const http = error as { getStatus: () => number; getResponse: () => unknown };
    return { status: http.getStatus(), body: http.getResponse() };
  }
  throw new Error('esperava um erro');
}

describe('UsersService.atualizarPerfil (perfil CA-02)', () => {
  it('grava o nome APARADO no usuário do token e devolve o Usuario com a data em ISO', async () => {
    const { service, update } = setup();
    update.mockResolvedValue(ROW);

    const usuario = await service.atualizarPerfil(ROW.id, { nome: '  Ana Souza ' });

    expect(update).toHaveBeenCalledWith({
      where: { id: ROW.id },
      data: { nome: 'Ana Souza' },
      select: USUARIO_PUBLICO_SELECT,
    });
    expect(usuario).toEqual({
      id: ROW.id,
      nome: 'Ana Souza',
      email: 'ana@exemplo.com',
      criadoEm: '2026-09-24T12:00:00.000Z',
    });
  });

  it('só o nome é gravado: o e-mail nunca entra no `data`', async () => {
    const { service, update } = setup();
    update.mockResolvedValue(ROW);

    await service.atualizarPerfil(ROW.id, { nome: 'Ana' });

    expect(Object.keys(update.mock.calls[0][0].data)).toEqual(['nome']);
  });

  it('o select é a lista branca: id, nome, email e criadoEm, nunca senhaHash', () => {
    expect(Object.keys(USUARIO_PUBLICO_SELECT).sort()).toEqual(['criadoEm', 'email', 'id', 'nome']);
  });

  it('a resposta não carrega nenhum campo além do contrato, mesmo que o banco devolva mais', async () => {
    const { service, update } = setup();
    update.mockResolvedValue({ ...ROW, senhaHash: 'scrypt$x', atualizadoEm: new Date() });

    const usuario = await service.atualizarPerfil(ROW.id, { nome: 'Ana Souza' });

    expect(Object.keys(usuario).sort()).toEqual(['criadoEm', 'email', 'id', 'nome']);
  });

  it('conta que não existe mais (P2025) → 401 AUTH_SESSAO_ENCERRADA', async () => {
    const { service, update } = setup();
    update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: 'teste',
      }),
    );

    await expect(errorOf(service.atualizarPerfil(ROW.id, { nome: 'Ana' }))).resolves.toMatchObject({
      status: 401,
      body: { code: 'AUTH_SESSAO_ENCERRADA' },
    });
  });

  it('outro erro do banco sobe como está (não vira 401)', async () => {
    const { service, update } = setup();
    const boom = new Error('conexão caiu');
    update.mockRejectedValue(boom);

    await expect(service.atualizarPerfil(ROW.id, { nome: 'Ana' })).rejects.toBe(boom);
  });
});

describe('UsersService.excluirConta (perfil CA-24 a CA-26)', () => {
  const ID = ROW.id;
  const NOVA = `${ID}/0b6c1f7e-2a3d-4e5f-8a9b-1c2d3e4f5a6b/7d1c2e60-1111-4222-8333-444455556666.png`;
  const ANTIGA = '0b6c1f7e-2a3d-4e5f-8a9b-1c2d3e4f5a6b/0a1b2c3d-1111-4222-8333-444455556666.webp';

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function comConta(ctx: ReturnType<typeof setup>, capas: string[] = [NOVA, ANTIGA]) {
    ctx.user.findUnique.mockResolvedValue({ senhaHash: 'fake$segredo-forte' });
    ctx.game.findMany.mockResolvedValue(capas.map((capaPath) => ({ capaPath })));
    ctx.user.delete.mockResolvedValue({ id: ID });
    ctx.storage.remove.mockResolvedValue(undefined);
  }

  it('ordem: confere a senha → lê as capas → apaga o usuário → remove cada capa pelo caminho (CA-24)', async () => {
    const ctx = setup();
    comConta(ctx);

    await expect(ctx.service.excluirConta(ID, { senha: 'segredo-forte' })).resolves.toBeUndefined();

    expect(ctx.game.findMany).toHaveBeenCalledWith({
      where: { userId: ID, capaPath: { not: null } },
      select: { capaPath: true },
    });
    expect(ctx.user.delete).toHaveBeenCalledWith({ where: { id: ID }, select: { id: true } });
    // Os DOIS formatos de caminho, cada um pelo nome exato (inclusive o antigo, fora de <userId>/).
    expect(ctx.storage.remove.mock.calls).toEqual([[NOVA], [ANTIGA]]);
    const ordem = (fn: jest.Mock) => fn.mock.invocationCallOrder[0] as number;
    expect(ordem(ctx.game.findMany)).toBeLessThan(ordem(ctx.user.delete));
    expect(ordem(ctx.user.delete)).toBeLessThan(ordem(ctx.storage.remove));
  });

  it('sem capas, apaga a conta e não chama o storage', async () => {
    const ctx = setup();
    comConta(ctx, []);

    await ctx.service.excluirConta(ID, { senha: 'segredo-forte' });

    expect(ctx.user.delete).toHaveBeenCalledTimes(1);
    expect(ctx.storage.remove).not.toHaveBeenCalled();
  });

  it('senha errada → 400 AUTH_SENHA_ATUAL_INCORRETA com fields.senha, e NADA é lido nem apagado (CA-25)', async () => {
    const ctx = setup();
    comConta(ctx);

    const erro = await errorOf(ctx.service.excluirConta(ID, { senha: 'nao-e-esta' }));

    expect(erro).toEqual({
      status: 400,
      body: {
        statusCode: 400,
        code: 'AUTH_SENHA_ATUAL_INCORRETA',
        message: 'Senha atual incorreta.',
        fields: { senha: 'Senha atual incorreta.' },
      },
    });
    expect(ctx.game.findMany).not.toHaveBeenCalled();
    expect(ctx.user.delete).not.toHaveBeenCalled();
    expect(ctx.storage.remove).not.toHaveBeenCalled();
  });

  it('storage falhando: a exclusão termina, cada capa gera um warn só com o caminho, e as outras seguem (CA-26)', async () => {
    const ctx = setup();
    comConta(ctx);
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    ctx.storage.remove.mockRejectedValue(new Error('apikey=sb_secret_NUNCA_NO_LOG 502'));

    await expect(ctx.service.excluirConta(ID, { senha: 'segredo-forte' })).resolves.toBeUndefined();

    expect(ctx.user.delete).toHaveBeenCalledTimes(1);
    expect(ctx.storage.remove).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledTimes(2);
    const linhas = warn.mock.calls.map((call) => String(call[0]));
    expect(linhas[0]).toContain(NOVA);
    expect(linhas[1]).toContain(ANTIGA);
    for (const linha of linhas) {
      expect(linha).not.toMatch(/sb_secret|apikey|segredo-forte/);
    }
  });

  it('conta que sumiu antes da leitura → 401 AUTH_SESSAO_ENCERRADA, sem apagar nada', async () => {
    const ctx = setup();
    ctx.user.findUnique.mockResolvedValue(null);

    await expect(errorOf(ctx.service.excluirConta(ID, { senha: 'x' }))).resolves.toMatchObject({
      status: 401,
      body: { code: 'AUTH_SESSAO_ENCERRADA' },
    });
    expect(ctx.user.delete).not.toHaveBeenCalled();
  });

  it('conta que sumiu entre a senha e o delete (P2025) → 401 AUTH_SESSAO_ENCERRADA, sem tocar no storage', async () => {
    const ctx = setup();
    comConta(ctx);
    ctx.user.delete.mockRejectedValue(recordNotFound());

    await expect(
      errorOf(ctx.service.excluirConta(ID, { senha: 'segredo-forte' })),
    ).resolves.toMatchObject({ status: 401, body: { code: 'AUTH_SESSAO_ENCERRADA' } });
    expect(ctx.storage.remove).not.toHaveBeenCalled();
  });

  it('outro erro do banco no delete sobe como está, e nenhuma capa é removida', async () => {
    const ctx = setup();
    comConta(ctx);
    const boom = new Error('conexão caiu');
    ctx.user.delete.mockRejectedValue(boom);

    await expect(ctx.service.excluirConta(ID, { senha: 'segredo-forte' })).rejects.toBe(boom);
    expect(ctx.storage.remove).not.toHaveBeenCalled();
  });
});
