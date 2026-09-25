import { applyDecorators } from '@nestjs/common';
import { Transform, Type, type TransformFnParams } from 'class-transformer';

/**
 * O ValidationPipe global usa `enableImplicitConversion` (ARCHITECTURE.md §4.1), que converte por
 * tipo antes da validação: `titulo: ["a"]` viraria "a" e `gameplay: "7"` viraria 7, e ambos passariam.
 * Estes decorators leem o valor CRU do body (`obj[key]`), então o tipo enviado é o tipo validado.
 *
 * `@Type(() => Object)` desliga a conversão implícita da propriedade: sem ele, um body como
 * `{"senha":{"toString":"x"}}` faz o `String(valor)` do class-transformer lançar `TypeError` (500 num
 * endpoint público) antes de o `@Transform` ou a validação rodarem.
 */

/** Apara espaços nas pontas de strings; qualquer outro tipo passa cru e falha na validação. */
export const TrimString = () =>
  applyDecorators(
    Type(() => Object),
    Transform(({ obj, key }: TransformFnParams) => {
      const raw: unknown = obj[key];
      return typeof raw === 'string' ? raw.trim() : raw;
    }),
  );

/**
 * Texto de várias linhas (a descrição do jogo): `\r\n` e `\r` viram `\n` (os limites valem igual em
 * qualquer navegador) e as pontas são aparadas; as quebras do meio são preservadas.
 */
export const TrimText = () =>
  applyDecorators(
    Type(() => Object),
    Transform(({ obj, key }: TransformFnParams) => {
      const raw: unknown = obj[key];
      return typeof raw === 'string' ? raw.replace(/\r\n?/g, '\n').trim() : raw;
    }),
  );

/** Mantém o valor exatamente como veio no body/query (sem conversão implícita de tipo). */
export const RawValue = () =>
  applyDecorators(
    Type(() => Object),
    Transform(({ obj, key }: TransformFnParams) => obj[key] as unknown),
  );
