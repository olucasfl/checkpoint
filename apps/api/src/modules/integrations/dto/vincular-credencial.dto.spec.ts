import { BadRequestException } from '@nestjs/common';
import { createValidationPipe } from '../../../common/pipes/app-validation.pipe';
import { NPSSO_SINTETICO } from '../psn/__fixtures__/respostas';
import { VincularCredencialDto } from './vincular-credencial.dto';

const pipe = createValidationPipe();

function parse(body: unknown): Promise<VincularCredencialDto> {
  return pipe.transform(body, { type: 'body', metatype: VincularCredencialDto });
}

async function erroDe(
  body: unknown,
): Promise<{ message: string; fields?: Record<string, string> }> {
  const promise = parse(body);
  await expect(promise).rejects.toBeInstanceOf(BadRequestException);
  const error = (await promise.catch((e: unknown) => e)) as BadRequestException;
  expect(error.getResponse()).toMatchObject({ statusCode: 400, code: 'VALIDACAO' });
  return error.getResponse() as { message: string; fields?: Record<string, string> };
}

describe('VincularCredencialDto (CA-12)', () => {
  it.each([NPSSO_SINTETICO, 'a'.repeat(32), 'A-b_9'.repeat(10), 'x'.repeat(128)])(
    'aceita uma credencial com 32 a 128 letras, números, hífen e sublinhado',
    async (credencial) => {
      await expect(parse({ credencial })).resolves.toMatchObject({ credencial });
    },
  );

  it.each([
    ['ausente', {}],
    ['vazia', { credencial: '' }],
    ['curta', { credencial: 'a'.repeat(31) }],
    ['com 200 caracteres', { credencial: 'a'.repeat(200) }],
    ['com espaço', { credencial: `${'a'.repeat(32)} b` }],
    ['com aspas (colou o JSON inteiro)', { credencial: `"${'a'.repeat(40)}"` }],
    ['um número (não vira texto)', { credencial: 1234567890 }],
    ['um array', { credencial: [NPSSO_SINTETICO] }],
    ['um objeto', { credencial: { npsso: NPSSO_SINTETICO } }],
  ])('recusa credencial %s com 400 e fields.credencial', async (_nome, body) => {
    const erro = await erroDe(body);

    expect(erro.fields).toHaveProperty('credencial');
  });

  it('a mensagem de validação NÃO ecoa o valor enviado', async () => {
    const erro = await erroDe({ credencial: `${NPSSO_SINTETICO} com espaço` });

    expect(JSON.stringify(erro)).not.toContain('NPSSO_SINTETICO');
    expect(JSON.stringify(erro)).not.toContain('espaço');
  });

  it('um campo desconhecido → 400', async () => {
    await erroDe({ credencial: NPSSO_SINTETICO, extra: 1 });
  });
});
