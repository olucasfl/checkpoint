/**
 * Validador de FORMA em tempo de execução para o contrato com o web. Cada tipo do `@checkpoint/shared` ganha um
 * mapa `Record<keyof T, Tipo>`: o compilador OBRIGA o mapa a ter exatamente as chaves do tipo (uma chave nova no
 * shared sem o mapa não compila), e o teste compara esse mapa com o corpo que a API devolveu de verdade. Assim o
 * shared, a API e o mock do web não divergem em silêncio: qualquer um dos três que mude quebra aqui.
 */
export type Tipo =
  | 'string'
  | 'string?'
  | 'number'
  | 'number?'
  | 'boolean'
  | 'iso'
  | 'iso?'
  | 'uuid'
  | { objeto: Mapa; nulo?: boolean }
  | { lista: Mapa };

export type Mapa = Record<string, Tipo>;

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tipoDe(valor: unknown): string {
  return valor === null ? 'null' : Array.isArray(valor) ? 'array' : typeof valor;
}

/** Devolve a lista de problemas (vazia = o corpo tem exatamente a forma do mapa). */
export function problemas(valor: unknown, mapa: Mapa, caminho = '$'): string[] {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    return [`${caminho}: esperava objeto, veio ${tipoDe(valor)}`];
  }
  const corpo = valor as Record<string, unknown>;
  const achados: string[] = [];
  for (const chave of Object.keys(corpo)) {
    if (!(chave in mapa)) {
      achados.push(`${caminho}.${chave}: campo que o shared NÃO declara`);
    }
  }
  for (const [chave, tipo] of Object.entries(mapa)) {
    const aqui = `${caminho}.${chave}`;
    if (!(chave in corpo)) {
      achados.push(`${aqui}: campo do shared AUSENTE na resposta`);
      continue;
    }
    const v = corpo[chave];
    if (typeof tipo === 'string') {
      const anulavel = tipo.endsWith('?');
      const base = anulavel ? tipo.slice(0, -1) : tipo;
      if (v === null) {
        if (!anulavel) {
          achados.push(`${aqui}: null onde o shared exige ${base}`);
        }
        continue;
      }
      const ok =
        base === 'iso'
          ? typeof v === 'string' && ISO.test(v)
          : base === 'uuid'
            ? typeof v === 'string' && UUID.test(v)
            : typeof v === base;
      if (!ok) {
        achados.push(`${aqui}: esperava ${base}, veio ${tipoDe(v)} (${JSON.stringify(v)})`);
      }
    } else if ('objeto' in tipo) {
      if (v === null && tipo.nulo) {
        continue;
      }
      achados.push(...problemas(v, tipo.objeto, aqui));
    } else if (!Array.isArray(v)) {
      achados.push(`${aqui}: esperava lista, veio ${tipoDe(v)}`);
    } else {
      v.forEach((item, i) => achados.push(...problemas(item, tipo.lista, `${aqui}[${i}]`)));
    }
  }
  return achados;
}
