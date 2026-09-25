import { describe, expect, it } from 'vitest';
import { comFiltroInicial, paramsDoFiltro } from './initial-filter';
import { parseStatusFilter } from './status-filter';

const p = (query: string) => new URLSearchParams(query);

describe('comFiltroInicial (perfil CA-16)', () => {
  it('sem ?status= e filtro inicial Jogando → ?status=JOGANDO', () => {
    expect(comFiltroInicial(p(''), 'JOGANDO')?.toString()).toBe('status=JOGANDO');
  });

  it('mantém os outros parâmetros', () => {
    expect(comFiltroInicial(p('novo=1'), 'ZERADO')?.toString()).toBe('novo=1&status=ZERADO');
  });

  it('parâmetro explícito é respeitado: nada muda', () => {
    expect(comFiltroInicial(p('status=ZERADO'), 'JOGANDO')).toBeNull();
    expect(comFiltroInicial(p('status=TODOS'), 'JOGANDO')).toBeNull();
  });

  it('filtro inicial Todos não põe parâmetro (o comportamento de antes)', () => {
    expect(comFiltroInicial(p(''), 'TODOS')).toBeNull();
  });
});

describe('paramsDoFiltro', () => {
  it('com filtro inicial ≠ Todos, "Todos" vira ?status=TODOS, que o catálogo lê como Todos', () => {
    expect(paramsDoFiltro('TODOS', 'JOGANDO')).toEqual({ status: 'TODOS' });
    expect(parseStatusFilter('TODOS')).toBe('TODOS');
  });

  it('com filtro inicial Todos, "Todos" continua sem parâmetro', () => {
    expect(paramsDoFiltro('TODOS', 'TODOS')).toEqual({});
  });

  it('os status continuam como antes', () => {
    expect(paramsDoFiltro('ZERADO', 'JOGANDO')).toEqual({ status: 'ZERADO' });
    expect(paramsDoFiltro('JOGANDO', 'TODOS')).toEqual({ status: 'JOGANDO' });
  });
});
