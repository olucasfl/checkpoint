import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type Request, type Response } from 'express';
import { CSRF_HEADER, type Usuario } from '@checkpoint/shared';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ApiErrorResponseDto } from '../../common/errors/api-error-response.dto';
import { type EnvironmentVariables } from '../../config/env.validation';
import { clearRefreshCookie, setRefreshCookie } from './auth-cookie';
import { errorCode } from './auth-errors';
import { AuthThrottlerGuard, registrationLimitPerHour } from './auth-throttler.guard';
import { AuthService, type SessionResult } from './auth.service';
import {
  LOGIN_LIMIT,
  REFRESH_COOKIE_NAME,
  REFRESH_LIMIT,
  REGISTRATION_WINDOW_MS,
} from './auth.constants';
import { CsrfHeaderGuard } from './csrf-header.guard';
import { AuthResponseDto, UsuarioDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegistroDto } from './dto/registro.dto';

const CSRF_DOC = {
  name: CSRF_HEADER,
  description:
    'Deve ser `1`: sem ele a rota responde 403 `AUTH_ORIGEM_INVALIDA` (defesa contra CSRF).',
  required: true,
};

@ApiTags('auth')
@Controller('auth')
// Limite por IP em TODAS as rotas do controller; cada rota abaixo define o seu.
@UseGuards(AuthThrottlerGuard)
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Post('registro')
  @Public()
  @Throttle({
    default: { limit: () => registrationLimitPerHour(), ttl: REGISTRATION_WINDOW_MS },
  })
  @ApiOperation({
    summary: 'Cria a conta e já entra nela',
    description:
      'Devolve o access token no corpo e o refresh token no cookie `checkpoint_refresh` ' +
      '(HttpOnly). O e-mail é só o identificador de login: não é verificado e nenhum e-mail é enviado. ' +
      'Limite: 3 por hora por IP (padrão).',
  })
  @ApiCreatedResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: '`VALIDACAO`, com `fields`' })
  @ApiConflictResponse({ type: ApiErrorResponseDto, description: '`AUTH_EMAIL_EM_USO`' })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto, description: '`AUTH_REGISTRO_FECHADO`' })
  @ApiTooManyRequestsResponse({ type: ApiErrorResponseDto, description: '`LIMITE_TENTATIVAS`' })
  async register(
    @Body() dto: RegistroDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    return this.respondWithSession(response, await this.authService.register(dto, userAgent));
  }

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: LOGIN_LIMIT })
  @ApiOperation({
    summary: 'Entra com e-mail e senha (uma sessão nova neste dispositivo)',
    description: 'Limite: 5 por minuto por IP.',
  })
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: '`VALIDACAO`' })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: '`AUTH_CREDENCIAIS_INVALIDAS` (igual para e-mail inexistente e senha errada)',
  })
  @ApiTooManyRequestsResponse({ type: ApiErrorResponseDto, description: '`LIMITE_TENTATIVAS`' })
  async login(
    @Body() dto: LoginDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    return this.respondWithSession(response, await this.authService.login(dto, userAgent));
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @UseGuards(CsrfHeaderGuard)
  @Throttle({ default: REFRESH_LIMIT })
  @ApiOperation({
    summary: 'Renova a sessão (rotação do refresh token)',
    description:
      'Lê o cookie `checkpoint_refresh` e devolve um access token novo e um cookie novo. Sem corpo. ' +
      'Limite: 30 por minuto por IP.',
  })
  @ApiCookieAuth('checkpoint_refresh')
  @ApiHeader(CSRF_DOC)
  @ApiOkResponse({ type: AuthResponseDto })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto, description: '`AUTH_ORIGEM_INVALIDA`' })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto, description: '`AUTH_SESSAO_ENCERRADA`' })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: '`AUTH_REFRESH_CONCORRENTE`: outra aba acabou de renovar (janela de 30 s)',
  })
  @ApiTooManyRequestsResponse({ type: ApiErrorResponseDto, description: '`LIMITE_TENTATIVAS`' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    try {
      return this.respondWithSession(
        response,
        await this.authService.refresh(this.readRefreshCookie(request)),
      );
    } catch (error) {
      // Sessão perdida: o cookie não serve mais e não deve ser reenviado a cada carregamento.
      if (errorCode(error) === 'AUTH_SESSAO_ENCERRADA') {
        clearRefreshCookie(response, this.secureCookie());
      }
      throw error;
    }
  }

  @Post('logout')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(CsrfHeaderGuard)
  @ApiOperation({
    summary: 'Encerra a sessão deste dispositivo',
    description:
      'Idempotente: 204 sempre. Funciona com o access token vencido; as outras sessões continuam.',
  })
  @ApiCookieAuth('checkpoint_refresh')
  @ApiHeader(CSRF_DOC)
  @ApiNoContentResponse({ description: 'Sessão encerrada e cookie limpo' })
  @ApiForbiddenResponse({ type: ApiErrorResponseDto, description: '`AUTH_ORIGEM_INVALIDA`' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(this.readRefreshCookie(request));
    clearRefreshCookie(response, this.secureCookie());
  }

  @Get('me')
  @ApiOperation({ summary: 'O usuário logado' })
  @ApiBearerAuth()
  @ApiOkResponse({ type: UsuarioDto })
  @ApiUnauthorizedResponse({
    type: ApiErrorResponseDto,
    description: '`AUTH_NAO_AUTENTICADO`, `AUTH_TOKEN_EXPIRADO` ou `AUTH_SESSAO_ENCERRADA`',
  })
  me(@CurrentUser() user: AuthenticatedUser): Promise<Usuario> {
    return this.authService.me(user.id);
  }

  /** Põe o refresh token no cookie e devolve só o que vai no corpo. */
  private respondWithSession(response: Response, session: SessionResult): AuthResponseDto {
    setRefreshCookie(response, session.refreshToken, this.secureCookie());
    return { accessToken: session.accessToken, usuario: session.usuario };
  }

  private readRefreshCookie(request: Request): string | undefined {
    const value: unknown = request.cookies?.[REFRESH_COOKIE_NAME];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private secureCookie(): boolean {
    return this.config.get('NODE_ENV', { infer: true }) === 'production';
  }
}
