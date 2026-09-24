import { Body, Controller, Patch } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { type Usuario } from '@checkpoint/shared';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { ApiErrorResponseDto } from '../../common/errors/api-error-response.dto';
import { UsuarioDto } from '../auth/dto/auth-response.dto';
import { AtualizarPerfilDto } from './dto/atualizar-perfil.dto';
import { UsersService } from './users.service';

/** A conta do usuário logado (spec perfil). Todas as rotas são protegidas pelo guard global. */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('me')
  @ApiOperation({ summary: 'Troca o nome de exibição do usuário logado' })
  @ApiOkResponse({ type: UsuarioDto })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description:
      '`VALIDACAO`: nome vazio ou com mais de 60 caracteres, corpo vazio, campo desconhecido (inclusive `email`)',
  })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: '`AUTH_NAO_AUTENTICADO`, `AUTH_TOKEN_EXPIRADO` ou `AUTH_SESSAO_ENCERRADA`',
  })
  atualizarPerfil(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AtualizarPerfilDto,
  ): Promise<Usuario> {
    return this.usersService.atualizarPerfil(user.id, dto);
  }
}
