import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type AtualizarPerfilRequest,
  type ExcluirContaRequest,
  type Usuario,
} from '@checkpoint/shared';
import { PrismaService } from '../../database/prisma.service';
import { authErrors } from '../auth/auth-errors';
import { PasswordHasher } from '../auth/password-hasher';
import { GamesService } from '../games/games.service';
import { USUARIO_PUBLICO_SELECT, toUsuario } from './usuario-publico';

function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hasher: PasswordHasher,
    private readonly games: GamesService,
  ) {}

  /**
   * Troca o nome de exibição. O DTO já valida e apara; o `trim` aqui repete a regra para o service
   * nunca gravar espaços nas pontas, venha a chamada de onde vier.
   */
  async atualizarPerfil(userId: string, dto: AtualizarPerfilRequest): Promise<Usuario> {
    try {
      const row = await this.prisma.user.update({
        where: { id: userId },
        data: { nome: dto.nome.trim() },
        select: USUARIO_PUBLICO_SELECT,
      });
      return toUsuario(row);
    } catch (error) {
      // A conta sumiu entre o guard e o update (ex.: excluída em outro aparelho): a sessão acabou,
      // como no `GET /auth/me`.
      if (isRecordNotFound(error)) {
        throw authErrors.sessaoEncerrada();
      }
      throw error;
    }
  }

  /**
   * Exclui a conta. A ordem é a garantia: a senha confere ANTES de qualquer escrita (errada, nada
   * muda); os caminhos das capas são lidos antes do cascade, que apaga os jogos; o banco vem ANTES do
   * bucket. Com o storage falhando, a conta já não existe e sobra no máximo um objeto órfão (com aviso
   * no log), nunca uma conta pela metade, e o pedido da pessoa é atendido mesmo assim.
   */
  async excluirConta(userId: string, dto: ExcluirContaRequest): Promise<void> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { senhaHash: true },
    });
    if (!row) {
      throw authErrors.sessaoEncerrada();
    }
    if (!(await this.hasher.verify(row.senhaHash, dto.senha))) {
      throw authErrors.senhaAtualIncorreta('senha');
    }

    const capas = await this.games.listarCapasDoUsuario(userId);

    try {
      // Uma operação só: o `onDelete: Cascade` apaga os jogos e as sessões junto.
      await this.prisma.user.delete({ where: { id: userId }, select: { id: true } });
    } catch (error) {
      // Excluída entre a leitura acima e aqui (outro aparelho): a sessão acabou.
      if (isRecordNotFound(error)) {
        throw authErrors.sessaoEncerrada();
      }
      throw error;
    }

    await this.games.removerCapasSemFalhar(capas);
  }
}
