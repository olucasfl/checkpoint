import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, ValidateBy } from 'class-validator';
import {
  GAME_DESCRIPTION_MAX_LENGTH,
  GAME_RATING_CRITERIA,
  GAME_RATING_MAX,
  GAME_RATING_MIN,
  GAME_RATING_STEP,
  isValidRating,
  type GameRatingKey,
  type GameRatingsRequest,
} from '@checkpoint/shared';
import { RawValue, TrimText } from '../../../common/dto/transforms';

/**
 * Uma nota por critério, no topo do corpo (um campo por critério: o `ValidationPipe` é `whitelist +
 * forbidNonWhitelisted`, e o erro sai em `fields.<critério>`). Só número JSON: `RawValue` lê o valor cru,
 * então `"8"` (texto) falha em vez de virar 8 pela conversão implícita. `null` e ausente passam
 * (`IsOptional`); a regra por status é do service, sobre o estado final.
 */
function Rating(chave: GameRatingKey) {
  const criterio = GAME_RATING_CRITERIA.find((c) => c.chave === chave);
  const rotulo = criterio?.rotulo ?? chave;
  const message = `A nota de ${rotulo} deve ser um número de ${GAME_RATING_MIN} a ${GAME_RATING_MAX}, com no máximo 1 casa decimal`;

  return applyDecorators(
    ApiPropertyOptional({
      type: Number,
      nullable: true,
      minimum: GAME_RATING_MIN,
      maximum: GAME_RATING_MAX,
      multipleOf: GAME_RATING_STEP,
      example: 8.5,
      description: `${criterio?.descricao ?? ''} null remove a nota. Só com status ZERADO ou JOGANDO.`,
    }),
    IsOptional(),
    RawValue(),
    ValidateBy({
      name: 'isGameRating',
      validator: {
        validate: (valor: unknown) => isValidRating(valor),
        defaultMessage: () => message,
      },
    }),
  );
}

/**
 * Os campos de avaliação, comuns à criação e à edição (spec avaliacao-de-jogos). Todos opcionais e
 * aceitam `null`: no `PATCH`, `null` remove o valor.
 */
export abstract class GameRatingFieldsDto implements GameRatingsRequest {
  @Rating('gameplay')
  gameplay?: number | null;

  @Rating('historia')
  historia?: number | null;

  @Rating('graficos')
  graficos?: number | null;

  @Rating('trilhaSonora')
  trilhaSonora?: number | null;

  @Rating('performance')
  performance?: number | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: GAME_DESCRIPTION_MAX_LENGTH,
    example: 'Escalada difícil e trilha marcante.',
    description:
      'Texto simples (sem Markdown nem HTML), aparado, com as quebras de linha preservadas. Vazio, só espaços ou null = sem descrição.',
  })
  @IsOptional()
  @TrimText()
  @IsString({ message: 'A descrição deve ser um texto' })
  @MaxLength(GAME_DESCRIPTION_MAX_LENGTH, {
    message: `A descrição deve ter no máximo ${GAME_DESCRIPTION_MAX_LENGTH} caracteres`,
  })
  descricao?: string | null;
}
