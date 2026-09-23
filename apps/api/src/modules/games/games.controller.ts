import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GAME_COVER_FIELD } from '@checkpoint/shared';
import { ApiErrorResponseDto } from '../../common/errors/api-error-response.dto';
import { CoverUploadInterceptor } from './cover/cover-upload.interceptor';
import { CreateGameDto } from './dto/create-game.dto';
import { GameResponseDto } from './dto/game-response.dto';
import { ListGamesQueryDto } from './dto/list-games-query.dto';
import { UpdateGameDto } from './dto/update-game.dto';
import { GamesService } from './games.service';

@ApiTags('games')
@Controller('games')
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Get()
  @ApiOperation({
    summary: 'Lista os jogos, do alterado mais recentemente para o mais antigo',
    description: 'Filtre por status com `?status=ZERADO|JOGANDO|QUERO_JOGAR`.',
  })
  @ApiOkResponse({ type: GameResponseDto, isArray: true })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'Status inválido no filtro' })
  list(@Query() query: ListGamesQueryDto): Promise<GameResponseDto[]> {
    return this.gamesService.list(query.status);
  }

  @Post()
  @ApiOperation({ summary: 'Cadastra um jogo' })
  @ApiCreatedResponse({ type: GameResponseDto })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: 'Payload inválido, campo desconhecido ou nota com status QUERO_JOGAR',
  })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'Já existe um jogo com o mesmo título e plataforma',
  })
  create(@Body() dto: CreateGameDto): Promise<GameResponseDto> {
    return this.gamesService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edita um jogo (parcial)',
    description:
      'Envie ao menos um campo. Só `plataforma` e `nota` aceitam `null`. A regra da nota vale ' +
      'para o estado final do jogo: `{ "status": "QUERO_JOGAR" }` num jogo com nota é rejeitado, ' +
      'a menos que o mesmo body traga `"nota": null`. A capa não passa por aqui: use `PUT /games/:id/capa`.',
  })
  @ApiOkResponse({ type: GameResponseDto })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description:
      'Payload inválido, body vazio, id que não é UUID ou nota incompatível com o status',
  })
  @ApiNotFoundResponse({ description: 'Jogo não encontrado' })
  @ApiConflictResponse({
    type: ApiErrorResponseDto,
    description: 'A edição geraria duplicata de outro jogo',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGameDto,
  ): Promise<GameResponseDto> {
    return this.gamesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove um jogo (definitivo, sem lixeira)',
    description: 'Se o jogo tinha capa, o arquivo também é apagado do storage (best effort).',
  })
  @ApiNoContentResponse({ description: 'Jogo removido' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'id que não é UUID' })
  @ApiNotFoundResponse({ description: 'Jogo não encontrado' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.gamesService.remove(id);
  }

  @Put(':id/capa')
  @UseInterceptors(CoverUploadInterceptor)
  @ApiOperation({
    summary: 'Envia (ou troca) a capa do jogo',
    description:
      'multipart/form-data com **um** arquivo no campo `arquivo`. Só JPEG, PNG ou WebP (o tipo é ' +
      'conferido pelo conteúdo do arquivo, não pelo Content-Type nem pela extensão), até 2 MB. ' +
      'Trocar a capa apaga o arquivo antigo do storage.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [GAME_COVER_FIELD],
      properties: { [GAME_COVER_FIELD]: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOkResponse({ type: GameResponseDto, description: 'Jogo com `capaUrl` preenchida' })
  @ApiBadRequestResponse({
    type: ApiErrorResponseDto,
    description: 'Campo `arquivo` ausente/vazio, tipo fora de JPEG/PNG/WebP ou id que não é UUID',
  })
  @ApiNotFoundResponse({ description: 'Jogo não encontrado' })
  @ApiPayloadTooLargeResponse({ type: ApiErrorResponseDto, description: 'Arquivo acima de 2 MB' })
  @ApiBadGatewayResponse({ type: ApiErrorResponseDto, description: 'Falha do storage' })
  setCover(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<GameResponseDto> {
    return this.gamesService.setCover(id, file);
  }

  @Delete(':id/capa')
  @ApiOperation({
    summary: 'Remove a capa do jogo',
    description: 'Idempotente: um jogo sem capa também devolve 200, sem chamar o storage.',
  })
  @ApiOkResponse({ type: GameResponseDto, description: 'Jogo com `capaUrl: null`' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'id que não é UUID' })
  @ApiNotFoundResponse({ description: 'Jogo não encontrado' })
  @ApiBadGatewayResponse({
    type: ApiErrorResponseDto,
    description: 'Falha do storage; a capa continua associada ao jogo',
  })
  removeCover(@Param('id', ParseUUIDPipe) id: string): Promise<GameResponseDto> {
    return this.gamesService.removeCover(id);
  }
}
