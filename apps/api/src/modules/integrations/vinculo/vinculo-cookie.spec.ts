import { type CookieOptions, type Response } from 'express';
import { clearVinculoCookie, setVinculoCookie } from './vinculo-cookie';

interface Chamada {
  nome: string;
  valor: string;
  options: CookieOptions;
}

function respostaFalsa(): { response: Response; chamadas: Chamada[] } {
  const chamadas: Chamada[] = [];
  const response = {
    cookie: (nome: string, valor: string, options: CookieOptions) => {
      chamadas.push({ nome, valor, options });
    },
  } as unknown as Response;
  return { response, chamadas };
}

describe('cookie do vínculo (CA-06)', () => {
  it('HttpOnly, SameSite=Lax, Path=/api/integracoes, 10 minutos e sem Domain', () => {
    const { response, chamadas } = respostaFalsa();

    setVinculoCookie(response, 'nonce-sintetico', false);

    expect(chamadas).toEqual([
      {
        nome: 'checkpoint_vinculo',
        valor: 'nonce-sintetico',
        options: {
          httpOnly: true,
          sameSite: 'lax',
          path: '/api/integracoes',
          secure: false,
          maxAge: 600_000,
        },
      },
    ]);
    expect(chamadas[0]?.options).not.toHaveProperty('domain');
  });

  it('Secure quando é produção', () => {
    const { response, chamadas } = respostaFalsa();

    setVinculoCookie(response, 'n', true);

    expect(chamadas[0]?.options.secure).toBe(true);
  });

  it('limpar usa Max-Age=0 com os MESMOS atributos (senão o navegador não o descarta)', () => {
    const { response, chamadas } = respostaFalsa();

    clearVinculoCookie(response, true);

    expect(chamadas[0]).toEqual({
      nome: 'checkpoint_vinculo',
      valor: '',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/api/integracoes',
        secure: true,
        maxAge: 0,
      },
    });
  });
});
