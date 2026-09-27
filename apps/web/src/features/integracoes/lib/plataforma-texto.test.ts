import { PLATAFORMAS } from '@checkpoint/shared';
import { describe, expect, it } from 'vitest';
import {
  comPlataforma,
  dePlataforma,
  horasEConquistas,
  naPlataforma,
  textoDaConfirmacaoDePlataforma,
} from './plataforma-texto';

describe('textos das telas pelo cadastro', () => {
  it('concordam com a plataforma (da Steam, da PlayStation)', () => {
    expect(dePlataforma(PLATAFORMAS.STEAM)).toBe('da Steam');
    expect(dePlataforma(PLATAFORMAS.PLAYSTATION)).toBe('da PlayStation');
    expect(naPlataforma(PLATAFORMAS.PLAYSTATION)).toBe('na PlayStation');
    expect(comPlataforma(PLATAFORMAS.STEAM)).toBe('com a Steam');
  });

  it('respeitam o artigo do plural: "as conquistas" na Steam, "os troféus" na PlayStation', () => {
    expect(horasEConquistas(PLATAFORMAS.STEAM)).toBe('as horas e as conquistas');
    expect(horasEConquistas(PLATAFORMAS.PLAYSTATION)).toBe('as horas e os troféus');
    expect(textoDaConfirmacaoDePlataforma(PLATAFORMAS.STEAM)).toBe(
      'as horas e as conquistas mostradas serão as da Steam',
    );
    expect(textoDaConfirmacaoDePlataforma(PLATAFORMAS.PLAYSTATION)).toBe(
      'as horas e os troféus mostrados serão os da PlayStation',
    );
  });

  it('plataforma masculina ("ao Xbox") vira "do Xbox"', () => {
    const xbox = { ...PLATAFORMAS.STEAM, ligadoA: 'ao Xbox' };
    expect(dePlataforma(xbox)).toBe('do Xbox');
    expect(naPlataforma(xbox)).toBe('no Xbox');
    expect(comPlataforma(xbox)).toBe('com o Xbox');
  });
});
