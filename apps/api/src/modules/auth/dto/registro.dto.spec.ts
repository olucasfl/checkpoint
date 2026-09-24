import { BadRequestException } from '@nestjs/common';
import { type ApiErrorResponse } from '@checkpoint/shared';
import { createValidationPipe } from '../../../common/pipes/app-validation.pipe';
import { FIELD_MESSAGES } from './field-rules';
import { LoginDto } from './login.dto';
import { RegistroDto } from './registro.dto';

// Mesmas opções do ValidationPipe global do main.ts.
const pipe = createValidationPipe();

function parse<T extends object>(metatype: new () => T, body: unknown): Promise<T> {
  return pipe.transform(body, { type: 'body', metatype }) as Promise<T>;
}

async function rejection<T extends object>(
  metatype: new () => T,
  body: unknown,
): Promise<ApiErrorResponse> {
  try {
    await parse(metatype, body);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as ApiErrorResponse;
  }
  throw new Error('esperava que a validação rejeitasse o body');
}

const valid = { nome: 'Ana Teste', email: 'ana@exemplo.com', senha: 'segredo-forte' };

describe('RegistroDto (CA-01, CA-03)', () => {
  it('aceita um registro válido', async () => {
    await expect(parse(RegistroDto, valid)).resolves.toMatchObject(valid);
  });

  it('apara o nome e normaliza o e-mail (trim + minúsculas) ANTES de validar (CA-01)', async () => {
    const dto = await parse(RegistroDto, {
      nome: ' Ana Teste ',
      email: '  Ana@Exemplo.COM ',
      senha: 'segredo-forte',
    });

    expect(dto.nome).toBe('Ana Teste');
    expect(dto.email).toBe('ana@exemplo.com');
  });

  it('NÃO apara a senha: espaços contam (uma senha com espaços nas pontas é a senha)', async () => {
    const dto = await parse(RegistroDto, { ...valid, senha: '  segredo-forte  ' });

    expect(dto.senha).toBe('  segredo-forte  ');
  });

  it.each([
    ['nome vazio', { nome: '' }, 'nome', FIELD_MESSAGES.nomeVazio],
    ['nome só de espaços', { nome: '   ' }, 'nome', FIELD_MESSAGES.nomeVazio],
    ['nome de 61 caracteres', { nome: 'a'.repeat(61) }, 'nome', FIELD_MESSAGES.nomeLongo],
    ['e-mail sem formato', { email: 'ana' }, 'email', FIELD_MESSAGES.email],
    [
      'e-mail de 255 caracteres',
      { email: `${'a'.repeat(243)}@exemplo.com` },
      'email',
      FIELD_MESSAGES.email,
    ],
    ['senha de 7 caracteres', { senha: '1234567' }, 'senha', FIELD_MESSAGES.senhaCurta],
    ['senha de 37 "á" (74 bytes)', { senha: 'á'.repeat(37) }, 'senha', FIELD_MESSAGES.senhaLonga],
    ['senha de 8 espaços', { senha: ' '.repeat(8) }, 'senha', FIELD_MESSAGES.senhaSoEspacos],
  ])('400 VALIDACAO com o campo certo: %s', async (_nome, override, field, message) => {
    const error = await rejection(RegistroDto, { ...valid, ...override });

    expect(error).toMatchObject({ statusCode: 400, code: 'VALIDACAO' });
    expect(error.fields).toEqual({ [field]: message });
  });

  it('aceita uma senha de 36 "á" (72 bytes, o teto) e uma de 8 caracteres', async () => {
    await expect(parse(RegistroDto, { ...valid, senha: 'á'.repeat(36) })).resolves.toBeDefined();
    await expect(parse(RegistroDto, { ...valid, senha: '12345678' })).resolves.toBeDefined();
  });

  it('um emoji vale 4 bytes: 18 emojis (72 bytes) passam; 19 (76 bytes) não', async () => {
    await expect(parse(RegistroDto, { ...valid, senha: '😀'.repeat(18) })).resolves.toBeDefined();
    const error = await rejection(RegistroDto, { ...valid, senha: '😀'.repeat(19) });

    expect(error.fields?.senha).toBe(FIELD_MESSAGES.senhaLonga);
  });

  it('campo extra ("admin") é 400 e aparece na message, sem entrar em fields (CA-03f)', async () => {
    const error = await rejection(RegistroDto, { ...valid, admin: true });

    expect(error).toMatchObject({ statusCode: 400, code: 'VALIDACAO' });
    expect(error.message).toContain('admin');
    expect(error.fields).toBeUndefined();
  });

  it.each([
    ['nome', { nome: 123 }],
    ['nome', { nome: ['Ana'] }],
    ['email', { email: { a: 1 } }],
    ['senha', { senha: 12345678 }],
    ['senha', { senha: { toString: 'x' } }],
    ['senha', { senha: ['segredo-forte'] }],
  ])('%s com tipo errado é rejeitado (sem conversão implícita)', async (field, override) => {
    const error = await rejection(RegistroDto, { ...valid, ...override });

    expect(error.fields).toHaveProperty(field);
  });

  it('body sem campos aponta os três campos', async () => {
    const error = await rejection(RegistroDto, {});

    expect(Object.keys(error.fields ?? {}).sort()).toEqual(['email', 'nome', 'senha']);
  });
});

describe('LoginDto', () => {
  it('normaliza o e-mail e aceita uma senha curta (a regra do tamanho mínimo NÃO vale no login)', async () => {
    const dto = await parse(LoginDto, { email: ' ANA@exemplo.com', senha: 'curta' });

    expect(dto).toMatchObject({ email: 'ana@exemplo.com', senha: 'curta' });
  });

  it.each([
    ['senha vazia', { senha: '' }, 'senha', FIELD_MESSAGES.senhaLoginVazia],
    ['senha acima de 72 bytes', { senha: 'a'.repeat(73) }, 'senha', FIELD_MESSAGES.senhaLonga],
    ['e-mail inválido', { email: 'ana' }, 'email', FIELD_MESSAGES.email],
  ])('400: %s', async (_nome, override, field, message) => {
    const error = await rejection(LoginDto, { email: 'ana@exemplo.com', senha: 'x', ...override });

    expect(error).toMatchObject({ code: 'VALIDACAO' });
    expect(error.fields).toEqual({ [field]: message });
  });

  it('campo extra é 400', async () => {
    const error = await rejection(LoginDto, { email: 'ana@exemplo.com', senha: 'x', admin: true });

    expect(error.message).toContain('admin');
  });
});
