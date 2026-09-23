import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import {
  GAME_PLATFORM_MAX_LENGTH,
  GAME_RATING_MAX,
  GAME_RATING_MIN,
  GAME_STATUS,
  GAME_TITLE_MAX_LENGTH,
  type GameStatus,
  type UpdateGameRequest,
} from '@checkpoint/shared';
import { RawValue, TrimString } from './transforms';

/**
 * Todos os campos são opcionais, mas `titulo` e `status` NÃO aceitam `null`: por isso usam
 * `@ValidateIf` (só pula `undefined`) em vez de `@IsOptional` (que também pularia `null`).
 * Só `plataforma` e `nota` aceitam `null`, que remove o valor.
 */
export class UpdateGameDto implements UpdateGameRequest {
  @ApiPropertyOptional({ example: 'Hollow Knight', maxLength: GAME_TITLE_MAX_LENGTH })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @TrimString()
  @IsString({ message: 'Informe o título' })
  @IsNotEmpty({ message: 'Informe o título' })
  @MaxLength(GAME_TITLE_MAX_LENGTH, {
    message: `O título deve ter no máximo ${GAME_TITLE_MAX_LENGTH} caracteres`,
  })
  titulo?: string;

  @ApiPropertyOptional({ enum: GAME_STATUS, example: 'ZERADO' })
  @ValidateIf((_, value: unknown) => value !== undefined)
  @RawValue()
  @IsIn(GAME_STATUS, { message: 'Status inválido. Use ZERADO, JOGANDO ou QUERO_JOGAR' })
  status?: GameStatus;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: GAME_PLATFORM_MAX_LENGTH,
    example: 'PC',
    description: 'null, vazio ou só espaços remove a plataforma.',
  })
  @IsOptional()
  @TrimString()
  @IsString({ message: 'A plataforma deve ser um texto' })
  @MaxLength(GAME_PLATFORM_MAX_LENGTH, {
    message: `A plataforma deve ter no máximo ${GAME_PLATFORM_MAX_LENGTH} caracteres`,
  })
  plataforma?: string | null;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    minimum: GAME_RATING_MIN,
    maximum: GAME_RATING_MAX,
    example: 8,
    description:
      'null remove a nota. Só pode existir se o status FINAL do jogo for ZERADO ou JOGANDO.',
  })
  @IsOptional()
  @RawValue()
  @IsInt({
    message: `A nota deve ser um número inteiro de ${GAME_RATING_MIN} a ${GAME_RATING_MAX}`,
  })
  @Min(GAME_RATING_MIN, {
    message: `A nota deve ser um número inteiro de ${GAME_RATING_MIN} a ${GAME_RATING_MAX}`,
  })
  @Max(GAME_RATING_MAX, {
    message: `A nota deve ser um número inteiro de ${GAME_RATING_MIN} a ${GAME_RATING_MAX}`,
  })
  nota?: number | null;
}
