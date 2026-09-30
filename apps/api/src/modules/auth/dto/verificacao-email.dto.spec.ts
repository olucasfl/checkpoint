import { BadRequestException } from '@nestjs/common';
import { type ApiErrorResponse } from '@checkpoint/shared';
import { createValidationPipe } from '../../../common/pipes/app-validation.pipe';
import { FIELD_MESSAGES } from './field-rules';
import {
  EsqueciSenhaDto,
  RedefinirSenhaDto,
  ReenviarVerificacaoDto,
  VerificarEmailDto,
} from './verificacao-email.dto';

// Mesmas opções do ValidationPipe global do main.ts.
const pipe = createValidationPipe();

function parse<T>(metatype: new () => T, body: unknown): Promise<T> {
  return pipe.transform(body, { type: 'body', metatype }) as Promise<T>;
}

async function rejection<T>(metatype: new () => T, body: unknown): Promise<ApiErrorResponse> {
  try {
    await parse(metatype, body);
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    return (error as BadRequestException).getResponse() as ApiErrorResponse;
  }
  throw new Error('esperava que a validação rejeitasse o body');
}

const TOKEN = 'a1b2c3d4'.repeat(8);

describe('token (VerificarEmailDto e RedefinirSenhaDto) — CA-06', () => {
  it('aceita 64 hexadecimais minúsculos, sem aparar nada', async () => {
    await expect(parse(VerificarEmailDto, { token: TOKEN })).resolves.toEqual({ token: TOKEN });
  });

  it.each([
    ['vazio', ''],
    ['10 caracteres', 'abcdef0123'],
    ['63 caracteres', TOKEN.slice(1)],
    ['65 caracteres', `${TOKEN}a`],
    ['com maiúscula', `A${TOKEN.slice(1)}`],
    ['não hexadecimal', `g${TOKEN.slice(1)}`],
    ['com espaço nas pontas', ` ${TOKEN.slice(1)}`],
    ['número', 12345],
    ['lista', [TOKEN]],
    ['nulo', null],
    ['objeto hostil', { toString: 'x' }],
  ])('rejeita token %s com fields.token', async (_nome, token) => {
    const response = await rejection(VerificarEmailDto, { token });

    expect(response).toMatchObject({ code: 'VALIDACAO', fields: { token: FIELD_MESSAGES.token } });
  });

  it('token ausente também é 400 com fields.token', async () => {
    await expect(rejection(VerificarEmailDto, {})).resolves.toMatchObject({
      fields: { token: expect.any(String) },
    });
  });

  it('campo extra é 400 (whitelist + forbidNonWhitelisted)', async () => {
    const response = await rejection(VerificarEmailDto, { token: TOKEN, admin: true });

    expect(response.code).toBe('VALIDACAO');
  });
});

describe('e-mail (ReenviarVerificacaoDto e EsqueciSenhaDto)', () => {
  it.each([ReenviarVerificacaoDto, EsqueciSenhaDto])(
    'normaliza (trim + minúsculas) antes de validar — %p',
    async (Dto) => {
      await expect(parse(Dto, { email: '  Ana@Exemplo.COM ' })).resolves.toEqual({
        email: 'ana@exemplo.com',
      });
    },
  );

  it.each([ReenviarVerificacaoDto, EsqueciSenhaDto])(
    'rejeita e-mail inválido com fields.email — %p',
    async (Dto) => {
      await expect(rejection(Dto, { email: 'ana' })).resolves.toMatchObject({
        code: 'VALIDACAO',
        fields: { email: FIELD_MESSAGES.email },
      });
    },
  );

  it.each([ReenviarVerificacaoDto, EsqueciSenhaDto])(
    'rejeita e-mail de tipo errado sem estourar 500 — %p',
    async (Dto) => {
      await expect(rejection(Dto, { email: { toString: 'x' } })).resolves.toMatchObject({
        code: 'VALIDACAO',
      });
    },
  );
});

describe('RedefinirSenhaDto — CA-18', () => {
  it('aceita token e senha válidos, sem aparar a senha', async () => {
    await expect(
      parse(RedefinirSenhaDto, { token: TOKEN, novaSenha: ' nova-com-espacos ' }),
    ).resolves.toEqual({ token: TOKEN, novaSenha: ' nova-com-espacos ' });
  });

  it.each([
    ['7 caracteres', '1234567', FIELD_MESSAGES.senhaCurta],
    ['73 bytes (36 "á" + 1)', `${'á'.repeat(36)}x`, FIELD_MESSAGES.senhaLonga],
    ['só espaços', '        ', FIELD_MESSAGES.senhaSoEspacos],
    ['vazia', '', FIELD_MESSAGES.senhaCurta],
  ])('senha %s → fields.novaSenha', async (_nome, novaSenha, mensagem) => {
    const response = await rejection(RedefinirSenhaDto, { token: TOKEN, novaSenha });

    expect(response).toMatchObject({ code: 'VALIDACAO', fields: { novaSenha: mensagem } });
  });

  it('aceita 72 bytes exatos (36 "á")', async () => {
    await expect(
      parse(RedefinirSenhaDto, { token: TOKEN, novaSenha: 'á'.repeat(36) }),
    ).resolves.toBeDefined();
  });

  it('token ruim e senha ruim juntos: os dois campos vêm no erro', async () => {
    const response = await rejection(RedefinirSenhaDto, { token: 'x', novaSenha: '1' });

    expect(Object.keys(response.fields ?? {}).sort()).toEqual(['novaSenha', 'token']);
  });
});
