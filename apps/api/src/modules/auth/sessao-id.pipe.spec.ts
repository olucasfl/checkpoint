import { HttpException } from '@nestjs/common';
import { sessaoIdPipe } from './sessao-id.pipe';

const meta = { type: 'param', data: 'id' } as const;

describe('sessaoIdPipe (perfil CA-10)', () => {
  it('um UUID passa como está', async () => {
    await expect(
      sessaoIdPipe().transform('3f2b8a52-9c1e-4d6a-8f31-0a7e5b2c9d44', meta),
    ).resolves.toBe('3f2b8a52-9c1e-4d6a-8f31-0a7e5b2c9d44');
  });

  it.each([['abc'], [''], ['3f2b8a52-9c1e-4d6a-8f31'], ['../etc/passwd']])(
    '"%s" → 400 VALIDACAO no formato da API (com code), não o 400 padrão do Nest',
    async (id) => {
      const erro = await sessaoIdPipe()
        .transform(id, meta)
        .catch((e: unknown) => e);

      expect(erro).toBeInstanceOf(HttpException);
      expect((erro as HttpException).getStatus()).toBe(400);
      expect((erro as HttpException).getResponse()).toEqual({
        statusCode: 400,
        code: 'VALIDACAO',
        message: 'O id da sessão precisa ser um UUID.',
      });
    },
  );
});
