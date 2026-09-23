import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { GAME_STATUS, type GameStatus, type ListGamesQuery } from '@checkpoint/shared';
import { RawValue } from './transforms';

export class ListGamesQueryDto implements ListGamesQuery {
  @ApiPropertyOptional({ enum: GAME_STATUS, description: 'Filtra a lista por status.' })
  @IsOptional()
  @RawValue()
  @IsIn(GAME_STATUS, { message: 'Status inválido. Use ZERADO, JOGANDO ou QUERO_JOGAR' })
  status?: GameStatus;
}
