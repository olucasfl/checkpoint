import { describe, expect, it } from 'vitest';
import {
  confirmacaoError,
  emailError,
  FIELD_TEXT,
  loginSenhaError,
  nomeError,
  novaSenhaError,
} from './field-rules';

describe('regras de campo (as mesmas da API)', () => {
  it('nome: vazio ou só espaços; até 60 caracteres', () => {
    expect(nomeError('')).toBe(FIELD_TEXT.nomeVazio);
    expect(nomeError('   ')).toBe(FIELD_TEXT.nomeVazio);
    expect(nomeError('a'.repeat(61))).toBe(FIELD_TEXT.nomeLongo);
    expect(nomeError(` ${'a'.repeat(60)} `)).toBeUndefined();
  });

  it('e-mail: precisa ter formato', () => {
    expect(emailError('ana')).toBe(FIELD_TEXT.email);
    expect(emailError('ana@')).toBe(FIELD_TEXT.email);
    expect(emailError('  ana@exemplo.com ')).toBeUndefined();
  });

  it('senha nova: 8 caracteres, 72 bytes, não só espaços', () => {
    expect(novaSenhaError('1234567')).toBe(FIELD_TEXT.senhaCurta);
    expect(novaSenhaError('        ')).toBe(FIELD_TEXT.senhaSoEspacos);
    expect(novaSenhaError('á'.repeat(37))).toBe(FIELD_TEXT.senhaLonga);
    expect(novaSenhaError('á'.repeat(36))).toBeUndefined();
  });

  it('senha do login: só não vazia e até 72 bytes (o mínimo NÃO vale)', () => {
    expect(loginSenhaError('')).toBe(FIELD_TEXT.senhaLoginVazia);
    expect(loginSenhaError('curta')).toBeUndefined();
    expect(loginSenhaError('a'.repeat(73))).toBe(FIELD_TEXT.senhaLonga);
  });

  it('confirmação: tem de ser igual, sem apará-la', () => {
    expect(confirmacaoError('segredo-forte', 'segredo-forte')).toBeUndefined();
    expect(confirmacaoError('segredo-forte', 'segredo-forte ')).toBe('As senhas não coincidem');
  });
});
