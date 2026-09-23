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
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../common/errors/api-error-response.dto';
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
      'a menos que o mesmo body traga `"nota": null`.',
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
  @ApiOperation({ summary: 'Remove um jogo (definitivo, sem lixeira)' })
  @ApiNoContentResponse({ description: 'Jogo removido' })
  @ApiBadRequestResponse({ type: ApiErrorResponseDto, description: 'id que não é UUID' })
  @ApiNotFoundResponse({ description: 'Jogo não encontrado' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.gamesService.remove(id);
  }
}
