import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type AtualizarPerfilRequest, type Usuario } from '@checkpoint/shared';
import { PrismaService } from '../../database/prisma.service';
import { authErrors } from '../auth/auth-errors';
import { USUARIO_PUBLICO_SELECT, toUsuario } from './usuario-publico';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw authErrors.sessaoEncerrada();
      }
      throw error;
    }
  }
}
