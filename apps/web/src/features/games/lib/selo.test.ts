import { describe, expect, it } from 'vitest';
import { type PlataformaInfo } from '@checkpoint/shared';
import { dadosSteam } from '@/test/api-fixtures';
import { selosDoJogo } from './selo';

const falsa = (id: string, nome: string, ligadoA: string): PlataformaInfo => ({
  id,
  slug: id.toLowerCase(),
  nome,
  nomeAcessivel: nome,
  disponivel: true,
  capacidades: [],
  marcador: { icone: 'link' },
  logo: null,
  ligadoA,
  rotuloDaConta: nome,
});
const cadastro = [
  falsa('STEAM', 'Steam', 'à Steam'),
  falsa('XBOX', 'Xbox', 'ao Xbox'),
  falsa('EPIC', 'Epic', 'à Epic'),
];
const dados = (...ids: string[]) =>
  ids.map((id) => ({ ...dadosSteam(), provedor: id }) as unknown as ReturnType<typeof dadosSteam>);

describe('selosDoJogo', () => {
  it('sem ligação: nenhum selo', () => {
    expect(selosDoJogo([], cadastro)).toBeNull();
  });
  it('uma ligação: "Ligado à Steam"', () => {
    expect(selosDoJogo(dados('STEAM'), cadastro)).toEqual({
      visiveis: ['STEAM'],
      extras: 0,
      rotulo: 'Ligado à Steam',
    });
  });
  it('duas ligações: na ordem do cadastro, não na dos dados', () => {
    const r = selosDoJogo(dados('XBOX', 'STEAM'), cadastro);
    expect(r).toEqual({ visiveis: ['STEAM', 'XBOX'], extras: 0, rotulo: 'Ligado a Steam e Xbox' });
  });
  it('três ligações: dois selos e "+1", com todos os nomes visíveis no rótulo', () => {
    const r = selosDoJogo(dados('EPIC', 'XBOX', 'STEAM'), cadastro);
    expect(r).toEqual({
      visiveis: ['STEAM', 'XBOX'],
      extras: 1,
      rotulo: 'Ligado a Steam, Xbox e mais 1',
    });
  });
});
