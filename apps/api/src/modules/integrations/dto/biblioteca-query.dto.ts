import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type, type TransformFnParams } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { TrimString } from '../../../common/dto/transforms';
import {
  BIBLIOTECA_BUSCA_MAX,
  BIBLIOTECA_LIMITE_MAXIMO,
  BIBLIOTECA_LIMITE_PADRAO,
} from '../integrations.constants';

/**
 * Um inteiro na query: só texto de dígitos vira número; qualquer outra coisa (`abc`, `1.5`, `1e2`, um parâmetro
 * repetido) passa CRU e falha no `@IsInt`. A conversão implícita do pipe global transformaria `""` em 0 e um
 * array em número, por isso a leitura é do valor cru.
 */
const InteiroDaQuery = () =>
  applyDecorators(
    Type(() => Object),
    Transform(({ obj, key }: TransformFnParams) => {
      const raw: unknown = obj[key];
      return typeof raw === 'string' && /^\d{1,6}$/.test(raw) ? Number(raw) : raw;
    }),
  );

/** `GET /api/integracoes/:provedor/biblioteca?busca=&limite=` */
export class BibliotecaQueryDto {
  @ApiPropertyOptional({
    description: 'Trecho do título, sem diferenciar caixa nem acento',
    maxLength: BIBLIOTECA_BUSCA_MAX,
  })
  @IsOptional()
  @TrimString()
  @IsString({ message: 'A busca deve ser um texto' })
  @MaxLength(BIBLIOTECA_BUSCA_MAX, {
    message: `A busca deve ter no máximo ${BIBLIOTECA_BUSCA_MAX} caracteres`,
  })
  busca?: string;

  @ApiPropertyOptional({
    description: 'Quantos itens devolver, por horas jogadas',
    minimum: 1,
    maximum: BIBLIOTECA_LIMITE_MAXIMO,
    default: BIBLIOTECA_LIMITE_PADRAO,
  })
  @IsOptional()
  @InteiroDaQuery()
  @IsInt({ message: `O limite deve ser um inteiro de 1 a ${BIBLIOTECA_LIMITE_MAXIMO}` })
  @Min(1, { message: `O limite deve ser um inteiro de 1 a ${BIBLIOTECA_LIMITE_MAXIMO}` })
  @Max(BIBLIOTECA_LIMITE_MAXIMO, {
    message: `O limite deve ser um inteiro de 1 a ${BIBLIOTECA_LIMITE_MAXIMO}`,
  })
  limite?: number;

  @ApiPropertyOptional({
    description: 'Só os itens nunca abertos (0 minutos): o backlog. Só `true` ou `false`.',
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ obj, key }: TransformFnParams) => {
    const raw: unknown = obj[key];
    return raw === 'true' ? true : raw === 'false' ? false : raw;
  })
  @IsBoolean({ message: 'nuncaJogados deve ser true ou false' })
  nuncaJogados?: boolean;
}
