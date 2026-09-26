import { describe, expect, it } from 'vitest';
import { percentualDoBacklog, textoDoBacklog, textoDoStatus, textoNoCheckpoint } from './resumo';

describe('percentualDoBacklog', () => {
  it.each([
    [120, 400, 30],
    [1, 3, 33],
    [2, 3, 67],
    [0, 10, 0],
    [10, 10, 100],
    [0, 0, 0],
    [5, 0, 0],
  ])('%i nunca abertos de %i = %i%%', (nunca, total, esperado) => {
    expect(percentualDoBacklog(nunca, total)).toBe(esperado);
  });
});

describe('textoDoStatus', () => {
  it('online, offline e jogando (com ou sem o nome do jogo)', () => {
    expect(textoDoStatus('online', null)).toBe('Online');
    expect(textoDoStatus('offline', null)).toBe('Offline');
    expect(textoDoStatus('jogando', 'Celeste')).toBe('Jogando Celeste');
    expect(textoDoStatus('jogando', null)).toBe('Em jogo');
  });
  it('sem o dado, nenhum texto', () => {
    expect(textoDoStatus(null, null)).toBeNull();
  });
});

describe('textoNoCheckpoint e textoDoBacklog', () => {
  it('singular e plural', () => {
    expect(textoNoCheckpoint(12, 38)).toBe('12 dos seus 38 jogos já estão no checkpoint');
    expect(textoNoCheckpoint(1, 38)).toBe('1 dos seus 38 jogos já está no checkpoint');
    expect(textoNoCheckpoint(0, 1)).toBe('0 dos seus 1 jogo já estão no checkpoint');
    expect(textoDoBacklog(120)).toBe('120 nunca abertos');
    expect(textoDoBacklog(1)).toBe('1 nunca aberto');
  });
});
