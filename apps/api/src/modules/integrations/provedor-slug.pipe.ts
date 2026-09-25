import { Injectable, type PipeTransform } from '@nestjs/common';
import { PROVEDOR_SLUG, PROVEDORES, type Provedor } from '@checkpoint/shared';
import { badRequestError } from '../../common/errors/api-error';

/**
 * O `:provedor` da rota (o _slug_ em minúsculas, `steam`) vira o enum `Provedor`. Desconhecido → 400
 * `VALIDACAO` no formato da API. Um pipe e não um DTO de parâmetro: o pipe global trataria `provedor` (que não
 * é campo de formulário) como "campo não permitido". Igualdade exata: `STEAM` e `Steam` não são `steam`.
 */
@Injectable()
export class ProvedorSlugPipe implements PipeTransform<string, Provedor> {
  transform(value: string): Provedor {
    const provedor = PROVEDORES.find((candidato) => PROVEDOR_SLUG[candidato] === value);
    if (!provedor) {
      throw badRequestError('Provedor desconhecido', undefined, 'VALIDACAO');
    }
    return provedor;
  }
}
