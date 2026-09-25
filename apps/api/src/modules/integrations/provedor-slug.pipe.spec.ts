import { HttpException } from '@nestjs/common';
import { ProvedorSlugPipe } from './provedor-slug.pipe';

describe('ProvedorSlugPipe (CA-07)', () => {
  const pipe = new ProvedorSlugPipe();

  it('steam vira o enum STEAM', () => {
    expect(pipe.transform('steam')).toBe('STEAM');
  });

  it.each(['xbox', 'STEAM', 'Steam', '', ' steam', 'steam ', '__proto__', 'constructor', 'psn'])(
    '%j → 400 VALIDACAO no formato da API',
    (valor) => {
      let erro: unknown;
      try {
        pipe.transform(valor);
      } catch (e) {
        erro = e;
      }

      expect(erro).toBeInstanceOf(HttpException);
      expect((erro as HttpException).getStatus()).toBe(400);
      expect((erro as HttpException).getResponse()).toMatchObject({
        statusCode: 400,
        code: 'VALIDACAO',
      });
    },
  );
});
