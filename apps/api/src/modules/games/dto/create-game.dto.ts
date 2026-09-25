import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  GAME_PLATFORM_MAX_LENGTH,
  GAME_STATUS,
  GAME_TITLE_MAX_LENGTH,
  type CreateGameRequest,
  type GameStatus,
} from '@checkpoint/shared';
import { RawValue, TrimString } from '../../../common/dto/transforms';
import { GameRatingFieldsDto } from './rating-fields.dto';

export class CreateGameDto extends GameRatingFieldsDto implements CreateGameRequest {
  @ApiProperty({ example: 'Hollow Knight', maxLength: GAME_TITLE_MAX_LENGTH })
  @TrimString()
  @IsString({ message: 'Informe o título' })
  @IsNotEmpty({ message: 'Informe o título' })
  @MaxLength(GAME_TITLE_MAX_LENGTH, {
    message: `O título deve ter no máximo ${GAME_TITLE_MAX_LENGTH} caracteres`,
  })
  titulo!: string;

  @ApiProperty({ enum: GAME_STATUS, example: 'JOGANDO' })
  @RawValue()
  @IsIn(GAME_STATUS, { message: 'Status inválido. Use ZERADO, JOGANDO ou QUERO_JOGAR' })
  status!: GameStatus;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: GAME_PLATFORM_MAX_LENGTH,
    example: 'PC',
    description: 'Vazio, só espaços ou null = sem plataforma.',
  })
  @IsOptional()
  @TrimString()
  @IsString({ message: 'A plataforma deve ser um texto' })
  @MaxLength(GAME_PLATFORM_MAX_LENGTH, {
    message: `A plataforma deve ter no máximo ${GAME_PLATFORM_MAX_LENGTH} caracteres`,
  })
  plataforma?: string | null;
}
