import { Transform, type TransformFnParams } from 'class-transformer';

/**
 * O ValidationPipe global usa `enableImplicitConversion` (ARCHITECTURE.md §4.1), que converte por
 * tipo antes da validação: `titulo: ["a"]` viraria "a" e `nota: "7"` viraria 7, e ambos passariam.
 * Estes decorators leem o valor CRU do body (`obj[key]`), então o tipo enviado é o tipo validado.
 */

/** Apara espaços nas pontas de strings; qualquer outro tipo passa cru e falha no `@IsString`. */
export const TrimString = () =>
  Transform(({ obj, key }: TransformFnParams) => {
    const raw: unknown = obj[key];
    return typeof raw === 'string' ? raw.trim() : raw;
  });

/** Mantém o valor exatamente como veio no body/query (sem conversão implícita de tipo). */
export const RawValue = () => Transform(({ obj, key }: TransformFnParams) => obj[key] as unknown);
