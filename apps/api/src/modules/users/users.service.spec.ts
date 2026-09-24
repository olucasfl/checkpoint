import { Prisma } from '@prisma/client';
import { type PrismaService } from '../../database/prisma.service';
import { USUARIO_PUBLICO_SELECT } from './usuario-publico';
import { UsersService } from './users.service';

// PrismaService mockado como objeto simples de funções (RULES.md §5): nenhum teste toca o banco.
function setup() {
  const update = jest.fn();
  const prisma = { user: { update } } as unknown as PrismaService;
  return { service: new UsersService(prisma), update };
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
