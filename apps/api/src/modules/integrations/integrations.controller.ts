import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiFoundResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { type Request, type Response } from 'express';
import {
  type ContaVinculada,
  type ItemBiblioteca,
  type PerfilPlataforma,
  type Provedor,
} from '@checkpoint/shared';
import { Public } from '../../common/decorators/public.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { ApiErrorResponseDto } from '../../common/errors/api-error-response.dto';
import { type EnvironmentVariables } from '../../config/env.validation';
import { BibliotecaQueryDto } from './dto/biblioteca-query.dto';
import {
  ContaVinculadaDto,
  IniciarVinculoResponseDto,
  ItemBibliotecaDto,
  PerfilPlataformaDto,
} from './dto/integracao-response.dto';
import {
  INTEGRACOES_LIMIT,
  INTEGRACOES_VINCULO_LIMIT,
  VINCULO_COOKIE_NAME,
} from './integrations.constants';
import { IntegrationsService } from './integrations.service';
import { IntegrationsThrottlerGuard } from './integrations-throttler.guard';
import { PlataformaExceptionFilter } from './plataforma-http-errors';
import { ProvedorSlugPipe } from './provedor-slug.pipe';
import { clearVinculoCookie, setVinculoCookie } from './vinculo/vinculo-cookie';

const PROVEDOR_PARAM = {
  name: 'provedor',
  description: 'O provedor, em minúsculas: `steam`',
  example: 'steam',
} as const;

/**
 * Integrações com plataformas de jogos (spec `integracao-plataformas`). Protegidas pelo guard global, EXCETO o
 * retorno do OpenID (`@Public()`: é um GET do navegador vindo da Steam, sem `Authorization`). Limite por
 * usuário, não por IP. Falha da plataforma é 502, nunca 500.
 */
@ApiTags('integracoes')
@ApiBearerAuth()
@Controller('integracoes')
@UseGuards(IntegrationsThrottlerGuard)
@UseFilters(PlataformaExceptionFilter)
@Throttle({ default: INTEGRACOES_LIMIT })
export class IntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista as contas de plataformas vinculadas ao usuário logado' })
  @ApiOkResponse({ type: [ContaVinculadaDto] })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  listar(@CurrentUser() user: AuthenticatedUser): Promise<ContaVinculada[]> {
    return this.integrations.listarContas(user.id);
  }

  @Post(':provedor/vinculo')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: INTEGRACOES_VINCULO_LIMIT })
  @Header('cache-control', 'no-store')
  @ApiOperation({
    summary: 'Começa o vínculo: devolve a URL da plataforma e grava o cookie `checkpoint_vinculo`',
    description:
      'O `state` (JWT de 10 min) vai na URL de retorno e o `nonce` dele no cookie `HttpOnly`; o retorno só ' +
      'vale se os dois baterem. O web faz `window.location.assign(url)`.',
  })
  @ApiParam(PROVEDOR_PARAM)
  @ApiOkResponse({ type: IniciarVinculoResponseDto })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: '`VALIDACAO`: provedor desconhecido',
  })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: '`PLATAFORMA_JA_VINCULADA`: já há uma conta vinculada (desvincule antes)',
  })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ApiErrorResponseDto, description: '`LIMITE_TENTATIVAS`' })
  async iniciar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provedor', ProvedorSlugPipe) provedor: Provedor,
    @Res({ passthrough: true }) response: Response,
  ): Promise<IniciarVinculoResponseDto> {
    const { resposta, nonce } = await this.integrations.iniciarVinculo(user.id, provedor);
    setVinculoCookie(response, nonce, this.secureCookie());
    return resposta;
  }

  /**
   * O retorno da plataforma. NUNCA responde JSON de erro: todo desfecho é um 302 para o `/perfil` do web, com
   * `?steam=vinculada` ou `?steam=erro&motivo=…`. Sem DTO de propósito: o `ValidationPipe` global recusaria
   * as dezenas de chaves `openid.*` (`forbidNonWhitelisted`); quem valida é o provider.
   */
  @Public()
  @SkipThrottle()
  @Get(':provedor/retorno')
  @ApiOperation({
    summary: 'Retorno do OpenID: confere, grava o vínculo e redireciona para o /perfil',
    description:
      'Público (é um GET do navegador vindo da Steam). Falha vira 302 com `motivo` (`cancelado`, `invalido`, ' +
      '`expirado`, `indisponivel`, `ja-vinculada`), nunca JSON.',
  })
  @ApiParam(PROVEDOR_PARAM)
  @ApiFoundResponse({
    description: 'Redireciona para `/perfil?steam=vinculada` ou `/perfil?steam=erro&motivo=…`',
  })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: '`VALIDACAO`: provedor desconhecido',
  })
  async retorno(
    @Param('provedor', ProvedorSlugPipe) provedor: Provedor,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const cookie: unknown = request.cookies?.[VINCULO_COOKIE_NAME];
    const resultado = await this.integrations.concluirVinculo(
      provedor,
      request.query,
      typeof cookie === 'string' ? cookie : undefined,
    );
    // O cookie vale uma volta só, com ou sem sucesso.
    clearVinculoCookie(response, this.secureCookie());
    response.setHeader('cache-control', 'no-store');
    response.redirect(HttpStatus.FOUND, this.integrations.urlDoRedirecionamento(resultado));
  }

  @Delete(':provedor')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Desvincula a conta e apaga os dados da plataforma dos jogos',
    description: 'Os jogos, notas, status, descrição e capas do usuário não são tocados.',
  })
  @ApiParam(PROVEDOR_PARAM)
  @ApiNoContentResponse({ description: 'Desvinculada' })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: '`VALIDACAO`: provedor desconhecido',
  })
  @ApiConflictResponse({ type: ApiErrorResponseDto, description: '`PLATAFORMA_NAO_VINCULADA`' })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  desvincular(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provedor', ProvedorSlugPipe) provedor: Provedor,
  ): Promise<void> {
    return this.integrations.desvincular(user.id, provedor);
  }

  @Get(':provedor/perfil')
  @Header('cache-control', 'no-store')
  @ApiOperation({
    summary: 'O cartão do perfil: nome, avatar, totais e os mais jogados',
    description:
      'A biblioteca vem da plataforma (cache de 10 min). As conquistas são a soma dos jogos vinculados, já ' +
      'gravada no banco.',
  })
  @ApiParam(PROVEDOR_PARAM)
  @ApiOkResponse({ type: PerfilPlataformaDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: '`VALIDACAO`' })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: '`PLATAFORMA_NAO_VINCULADA` ou `PLATAFORMA_PERFIL_PRIVADO`',
  })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ApiErrorResponseDto, description: '`LIMITE_TENTATIVAS`' })
  @ApiResponse502()
  perfil(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provedor', ProvedorSlugPipe) provedor: Provedor,
  ): Promise<PerfilPlataforma> {
    return this.integrations.perfil(user.id, provedor);
  }

  @Get(':provedor/biblioteca')
  @Header('cache-control', 'no-store')
  @ApiOperation({
    summary: 'A biblioteca do usuário na plataforma, para escolher o jogo a ligar',
    description:
      'Sem paginação: `busca` (trecho do título, sem caixa nem acento) e `limite` (1 a 50, padrão 30) mantêm a ' +
      'resposta pequena, ordenada por horas. Usa o mesmo cache de 10 min do cartão do perfil. Cada item traz os ' +
      'jogos do catálogo com o mesmo título (`jogosParecidos`) e o jogo a que já está ligado (`vinculadoA`); a ' +
      'rota nunca vincula nada.',
  })
  @ApiParam(PROVEDOR_PARAM)
  @ApiOkResponse({ type: [ItemBibliotecaDto] })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description:
      '`VALIDACAO`: provedor desconhecido, `busca` com mais de 100 caracteres ou `limite` fora de 1 a 50',
  })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: '`PLATAFORMA_NAO_VINCULADA` ou `PLATAFORMA_PERFIL_PRIVADO`',
  })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ApiErrorResponseDto, description: '`LIMITE_TENTATIVAS`' })
  @ApiResponse502()
  biblioteca(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provedor', ProvedorSlugPipe) provedor: Provedor,
    @Query() query: BibliotecaQueryDto,
  ): Promise<ItemBiblioteca[]> {
    return this.integrations.biblioteca(user.id, provedor, query);
  }

  @Post(':provedor/perfil/atualizacao')
  @HttpCode(HttpStatus.OK)
  @Header('cache-control', 'no-store')
  @ApiOperation({
    summary: 'Atualiza o cartão do perfil (ignora o cache, no máximo uma consulta a cada 30 s)',
    description: 'Antes de 30 s da última consulta, devolve o que já tem, sem chamar a plataforma.',
  })
  @ApiParam(PROVEDOR_PARAM)
  @ApiOkResponse({ type: PerfilPlataformaDto })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: '`VALIDACAO`' })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: '`PLATAFORMA_NAO_VINCULADA` ou `PLATAFORMA_PERFIL_PRIVADO`',
  })
  @ApiUnauthorizedResponse({ type: ApiErrorResponseDto })
  @ApiTooManyRequestsResponse({ type: ApiErrorResponseDto, description: '`LIMITE_TENTATIVAS`' })
  @ApiResponse502()
  atualizarPerfil(
    @CurrentUser() user: AuthenticatedUser,
    @Param('provedor', ProvedorSlugPipe) provedor: Provedor,
  ): Promise<PerfilPlataforma> {
    return this.integrations.perfil(user.id, provedor, { atualizar: true });
  }

  private secureCookie(): boolean {
    return this.config.get('NODE_ENV', { infer: true }) === 'production';
  }
}

/** A plataforma fora do ar ou no limite: 502 com `PLATAFORMA_INDISPONIVEL` ou `PLATAFORMA_LIMITE`. */
function ApiResponse502(): MethodDecorator {
  return ApiResponse({
    status: 502,
    type: ApiErrorResponseDto,
    description: '`PLATAFORMA_INDISPONIVEL` ou `PLATAFORMA_LIMITE` (nunca 500)',
  });
}
