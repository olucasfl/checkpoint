import { describe, expect, it } from 'vitest';
import { safeRedirect } from './safe-redirect';

describe('safeRedirect (CA-31)', () => {
  it.each([
    ['/perfil', '/perfil'],
    ['/', '/'],
    ['/?status=ZERADO', '/?status=ZERADO'],
    ['/perfil?x=1#y', '/perfil?x=1#y'],
    ['/status', '/status'],
    ['/loginx', '/loginx'],
  ])('caminho interno %j é aceito', (entrada, esperado) => {
    expect(safeRedirect(entrada)).toBe(esperado);
  });

  it.each([
    ['//malicioso.exemplo'],
    ['https://malicioso.exemplo'],
    ['http://malicioso.exemplo/x'],
    ['/\\malicioso.exemplo'],
    ['\\\\malicioso.exemplo'],
    ['javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['malicioso.exemplo'],
    ['perfil'],
    [''],
  ])('vetor %j vira "/"', (entrada) => {
    expect(safeRedirect(entrada)).toBe('/');
  });

  it.each([['/login'], ['/login?voltar=/perfil'], ['/login/'], ['/registro'], ['/registro?x=1']])(
    'apontar para %j (laço) vira "/"',
    (entrada) => {
      expect(safeRedirect(entrada)).toBe('/');
    },
  );

  it.each([['%2F%2Fmalicioso.exemplo'], ['%2Flogin'], ['/%2Fmalicioso.exemplo']])(
    'a decodificação também é conferida: %j vira "/"',
    (entrada) => {
      // "/%2Fhost" decodifica para "//host": outro host.
      expect(safeRedirect(entrada)).toBe('/');
    },
  );

  it.each([
    ['/perfil\n'],
    ['/perfil\r\nSet-Cookie: x=1'],
    ['/perfil\tx'],
    ['/\u0000perfil'],
    ['/perfil\u007f'],
  ])('caractere de controle (%j) vira "/"', (entrada) => {
    expect(safeRedirect(entrada)).toBe('/');
  });

  it('acima de 512 caracteres vira "/"; exatamente 512 passa', () => {
    expect(safeRedirect(`/${'a'.repeat(511)}`)).toBe(`/${'a'.repeat(511)}`);
    expect(safeRedirect(`/${'a'.repeat(512)}`)).toBe('/');
  });

  it('percentual malformado (%zz) vira "/", sem lançar', () => {
    expect(safeRedirect('/perfil%zz')).toBe('/');
  });

  it('null e undefined viram "/"', () => {
    expect(safeRedirect(null)).toBe('/');
    expect(safeRedirect(undefined)).toBe('/');
  });
});
