import { describe, expect, it } from 'vitest';
import { confirmacaoEncerrarOutras, iconeDoDispositivo, ultimoUso } from './sessoes';

describe('iconeDoDispositivo', () => {
  it.each([
    ['Chrome · Android', 'smartphone'],
    ['Safari · iOS', 'smartphone'],
    ['Edge · Windows', 'computer'],
    ['Firefox · Linux', 'computer'],
    ['Chrome · macOS', 'computer'],
    ['Outro · Outro', 'computer'],
  ])('%s → %s', (dispositivo, icone) => {
    expect(iconeDoDispositivo(dispositivo)).toBe(icone);
  });
});

describe('ultimoUso (perfil CA-12)', () => {
  it('"Último uso em dd/mm/aaaa hh:mm", sem vírgula, no fuso do aparelho', () => {
    const local = new Date(2026, 8, 23, 14, 32);

    expect(ultimoUso(local.toISOString())).toBe('Último uso em 23/09/2026 14:32');
  });

  it('hora da madrugada com dois dígitos (00:05, nunca 24:05)', () => {
    expect(ultimoUso(new Date(2026, 0, 2, 0, 5).toISOString())).toBe(
      'Último uso em 02/01/2026 00:05',
    );
  });

  it('data inválida não quebra a linha', () => {
    expect(ultimoUso('x')).toBe('Último uso desconhecido');
  });
});

describe('confirmacaoEncerrarOutras (perfil CA-13)', () => {
  it('o texto da spec para N sessões', () => {
    expect(confirmacaoEncerrarOutras(2)).toBe(
      'Encerrar 2 sessões? Esses aparelhos vão precisar entrar de novo.',
    );
  });

  it('singular para uma', () => {
    expect(confirmacaoEncerrarOutras(1)).toBe(
      'Encerrar 1 sessão? Esse aparelho vai precisar entrar de novo.',
    );
  });
});
