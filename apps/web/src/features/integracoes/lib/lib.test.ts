import { AxiosError } from 'axios';
import { describe, expect, it } from 'vitest';
import {
  avisoDoRetorno,
  MOTIVOS_DO_RETORNO,
  semParametrosDoRetorno,
  TEXTO_DO_MOTIVO,
} from './avisos-steam';
import { classificarFalhaDoCartao } from './estado-do-cartao';
import { horasCurtas, textoDasConquistas } from './format';
import { urlDaSteamSegura } from './steam-url';

describe('urlDaSteamSegura (CA-15)', () => {
  it('aceita só a tela de login da Steam', () => {
    expect(
      urlDaSteamSegura('https://steamcommunity.com/openid/login?openid.mode=checkid_setup&x=1'),
    ).toBe(true);
  });

  it.each([
    'http://steamcommunity.com/openid/login',
    'https://steamcommunity.com.evil.example/openid/login',
    'https://evil.example/steamcommunity.com/openid/login',
    'https://steamcommunity.com@evil.example/openid/login',
    'https://user:senha@steamcommunity.com/openid/login',
    'https://steamcommunity.com:8443/openid/login',
    'https://steamcommunity.com/openid/login/extra',
    'https://steamcommunity.com/id/alguem',
    'https://STEAMCOMMUNITY.com.br/openid/login',
    'javascript:alert(1)',
    'data:text/html,x',
    '//steamcommunity.com/openid/login',
    'nao-e-url',
    '',
    undefined,
    null,
    42,
    { url: 'https://steamcommunity.com/openid/login' },
  ])('recusa %j', (url) => {
    expect(urlDaSteamSegura(url)).toBe(false);
  });

  it('aceita o host em maiúsculas (a URL já normaliza)', () => {
    expect(urlDaSteamSegura('https://SteamCommunity.com/openid/login')).toBe(true);
  });
});

describe('avisoDoRetorno (CA-15)', () => {
  it('?steam=vinculada → sucesso', () => {
    expect(avisoDoRetorno(new URLSearchParams('steam=vinculada'))).toEqual({
      tipo: 'sucesso',
      texto: 'Conta Steam vinculada.',
    });
  });

  it.each(MOTIVOS_DO_RETORNO)('?steam=erro&motivo=%s → o texto próprio', (motivo) => {
    expect(avisoDoRetorno(new URLSearchParams(`steam=erro&motivo=${motivo}`))).toEqual({
      tipo: 'erro',
      texto: TEXTO_DO_MOTIVO[motivo],
    });
  });

  it.each([
    '',
    'steam=qualquer',
    'steam=erro',
    'steam=erro&motivo=xyz',
    'motivo=cancelado',
    'steam=VINCULADA',
  ])('%j é ignorado', (query) => {
    expect(avisoDoRetorno(new URLSearchParams(query))).toBeUndefined();
  });

  it('todo motivo conhecido tem texto, sem dado do usuário', () => {
    for (const motivo of MOTIVOS_DO_RETORNO) {
      expect(TEXTO_DO_MOTIVO[motivo].length).toBeGreaterThan(10);
    }
    expect(Object.keys(TEXTO_DO_MOTIVO).sort()).toEqual([...MOTIVOS_DO_RETORNO].sort());
  });

  it('semParametrosDoRetorno tira steam e motivo e deixa o resto', () => {
    expect(
      semParametrosDoRetorno(new URLSearchParams('steam=erro&motivo=expirado&x=1')).toString(),
    ).toBe('x=1');
  });
});

describe('horasCurtas', () => {
  it.each([
    [0, '0 min'],
    [45, '45 min'],
    [59, '59 min'],
    [60, '1 h'],
    [90, '1,5 h'],
    [119, '1,9 h'],
    [599, '9,9 h'],
    [600, '10 h'],
    [2_550, '42 h'],
    [2_579, '42 h'],
    [74_040, '1.234 h'],
    [-5, '0 min'],
    [12.9, '12 min'],
  ])('%i min → %s', (minutos, texto) => {
    expect(horasCurtas(minutos)).toBe(texto);
  });
});

describe('textoDasConquistas', () => {
  it.each([
    [{ desbloqueadas: 12, jogosVinculados: 3 }, '12 conquistas em 3 jogos vinculados'],
    [{ desbloqueadas: 0, jogosVinculados: 0 }, '0 conquistas em 0 jogos vinculados'],
    [{ desbloqueadas: 1, jogosVinculados: 1 }, '1 conquista em 1 jogo vinculado'],
    [{ desbloqueadas: 1, jogosVinculados: 5 }, '1 conquista em 5 jogos vinculados'],
    [{ desbloqueadas: 7, jogosVinculados: 1 }, '7 conquistas em 1 jogo vinculado'],
  ])('%j', (entrada, texto) => {
    expect(textoDasConquistas(entrada)).toBe(texto);
  });
});

describe('classificarFalhaDoCartao (CA-20, CA-21)', () => {
  function erro(status: number, code: string): AxiosError {
    return new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, {
      status,
      data: { statusCode: status, code, message: 'não usar' },
      statusText: '',
      headers: {},
      config: {} as never,
    });
  }

  it('PLATAFORMA_PERFIL_PRIVADO → privado', () => {
    expect(classificarFalhaDoCartao(erro(409, 'PLATAFORMA_PERFIL_PRIVADO'))).toBe('privado');
  });

  it('sem resposta → sem-conexao', () => {
    expect(classificarFalhaDoCartao(new AxiosError('Network Error', 'ERR_NETWORK'))).toBe(
      'sem-conexao',
    );
  });

  it.each([
    erro(502, 'PLATAFORMA_INDISPONIVEL'),
    erro(502, 'PLATAFORMA_LIMITE'),
    erro(409, 'PLATAFORMA_NAO_VINCULADA'),
    erro(500, 'VALIDACAO'),
    new TypeError('bug'),
    'texto',
    undefined,
  ])('qualquer outra coisa → erro (%#)', (falha) => {
    expect(classificarFalhaDoCartao(falha)).toBe('erro');
  });
});
