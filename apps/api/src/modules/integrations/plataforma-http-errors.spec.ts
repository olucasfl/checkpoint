import { type ArgumentsHost } from '@nestjs/common';
import {
  integracaoErrors,
  PlataformaExceptionFilter,
  plataformaHttpError,
} from './plataforma-http-errors';
import {
  IdExternoInvalidoError,
  PerfilPrivadoError,
  PlataformaIndisponivelError,
  PlataformaLimiteError,
  ProvedorNaoSuportadoError,
} from './providers/plataforma-errors';

describe('plataformaHttpError — domínio → HTTP (CA-20, CA-21)', () => {
  it.each([
    ['perfil privado', new PerfilPrivadoError(), 409, 'PLATAFORMA_PERFIL_PRIVADO'],
    ['plataforma indisponível', new PlataformaIndisponivelError(), 502, 'PLATAFORMA_INDISPONIVEL'],
    ['plataforma no limite', new PlataformaLimiteError(), 502, 'PLATAFORMA_LIMITE'],
  ])('%s → %i %s (nunca 500)', (_nome, erro, status, code) => {
    const http = plataformaHttpError(erro);

    expect(http?.getStatus()).toBe(status);
    expect(http?.getResponse()).toMatchObject({ statusCode: status, code });
  });

  it.each([
    ['ID malformado', new IdExternoInvalidoError('steamId', 'x')],
    ['provedor desconhecido', new ProvedorNaoSuportadoError('xbox')],
  ])('%s → 400 VALIDACAO', (_nome, erro) => {
    const http = plataformaHttpError(erro);

    expect(http?.getStatus()).toBe(400);
    expect(http?.getResponse()).toMatchObject({ code: 'VALIDACAO' });
  });

  it('o corpo tem mensagem fixa: nada do que a plataforma respondeu vaza', () => {
    const http = plataformaHttpError(
      new PlataformaIndisponivelError('corpo interno da Steam com key=SEGREDO'),
    );

    expect(JSON.stringify(http?.getResponse())).not.toContain('SEGREDO');
  });

  it('um erro que não é de domínio não é traduzido (null)', () => {
    expect(plataformaHttpError(new TypeError('bug'))).toBeNull();
  });
});

describe('integracaoErrors', () => {
  it('não vinculada e já vinculada são 409 com code estável (nunca 401)', () => {
    expect(integracaoErrors.naoVinculada().getStatus()).toBe(409);
    expect(integracaoErrors.naoVinculada().getResponse()).toMatchObject({
      code: 'PLATAFORMA_NAO_VINCULADA',
    });
    expect(integracaoErrors.jaVinculada().getStatus()).toBe(409);
    expect(integracaoErrors.jaVinculada().getResponse()).toMatchObject({
      code: 'PLATAFORMA_JA_VINCULADA',
    });
  });
});

describe('PlataformaExceptionFilter', () => {
  function hostComResposta() {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;
    return { host, status, json };
  }

  it('responde o status e o corpo do erro traduzido', () => {
    const { host, status, json } = hostComResposta();

    new PlataformaExceptionFilter().catch(new PlataformaLimiteError(), host);

    expect(status).toHaveBeenCalledWith(502);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ code: 'PLATAFORMA_LIMITE' }));
  });

  it('nunca devolve o erro cru: sem tradução, 500 com mensagem genérica', () => {
    const { host, status, json } = hostComResposta();

    new PlataformaExceptionFilter().catch(new TypeError('segredo'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(JSON.stringify(json.mock.calls)).not.toContain('segredo');
  });
});
