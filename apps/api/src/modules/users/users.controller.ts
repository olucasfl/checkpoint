import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type Response } from 'express';
import { type Usuario } from '@checkpoint/shared';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { ApiErrorResponseDto } from '../../common/errors/api-error-response.dto';
import { type EnvironmentVariables } from '../../config/env.validation';
import { clearRefreshCookie } from '../auth/auth-cookie';
import { AuthThrottlerGuard } from '../auth/auth-throttler.guard';
import { UsuarioDto } from '../auth/dto/auth-response.dto';
import { AtualizarPerfilDto } from './dto/atualizar-perfil.dto';
import { ExcluirContaDto } from './dto/excluir-conta.dto';
import { UsersService } from './users.service';

/** Por IP, com contador próprio (o throttler separa por rota): não divide cota com a troca de senha. */
export const EXCLUSAO_CONTA_LIMIT = { limit: 5, ttl: 15 * 60_000 } as const;

/** A conta do usuário logado (spec perfil). Todas as rotas são protegidas pelo guard global. */
@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

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

  @Post('me/exclusao')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthThrottlerGuard)
  @Throttle({ default: EXCLUSAO_CONTA_LIMIT })
  @ApiOperation({
    summary: 'Exclui a conta do usuário logado (não dá para desfazer)',
    description:
      'Exige a senha. Apaga a conta, todos os jogos e as sessões (no banco) e depois as capas no ' +
      'storage, em best effort: uma capa que não sai fica órfã e só gera aviso no log. `POST` com ' +
      'corpo, e não `DELETE`, que alguns proxies descartam. Limite: 5 a cada 15 minutos por IP.',
  })
  @ApiNoContentResponse({ description: 'Conta excluída; o cookie do refresh é limpo' })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description:
      '`VALIDACAO` (`fields.senha`) ou `AUTH_SENHA_ATUAL_INCORRETA` (`fields.senha`; nada é apagado)',
  })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: '`AUTH_NAO_AUTENTICADO`, `AUTH_TOKEN_EXPIRADO` ou `AUTH_SESSAO_ENCERRADA`',
  })
  @ApiTooManyRequestsResponse({ type: ApiErrorResponseDto, description: '`LIMITE_TENTATIVAS`' })
  async excluirConta(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ExcluirContaDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.usersService.excluirConta(user.id, dto);
    // As sessões já caíram com a conta; o cookie que sobrou no navegador não serve para mais nada.
    clearRefreshCookie(response, this.config.get('NODE_ENV', { infer: true }) === 'production');
  }
}
