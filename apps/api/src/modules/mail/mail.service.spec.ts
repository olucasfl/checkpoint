import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailIndisponivelError } from './mail.errors';
import { BREVO_SEND_URL, MailService } from './mail.service';

// Valores sintéticos e óbvios (RULES.md §8): nunca a chave nem o remetente reais do Brevo.
const CHAVE = 'chave-brevo-sintetica-de-teste';
const TOKEN = 'ab'.repeat(32);
const ANA = { email: 'ana@exemplo.com', nome: 'Ana Teste' };

function makeService(extra: Record<string, unknown> = {}): MailService {
  const values: Record<string, unknown> = {
    BREVO_API_KEY: CHAVE,
    MAIL_FROM_EMAIL: 'remetente@exemplo.com',
    WEB_PUBLIC_URL: 'https://checkpoint.exemplo.vercel.app',
    ...extra,
  };
  const config = { get: (key: string) => values[key] } as unknown as ConfigService<never, true>;
  return new MailService(config as never);
}

let fetchMock: jest.SpiedFunction<typeof fetch>;
let logs: string[];

function enviado(): { url: string; init: RequestInit; corpo: Record<string, unknown> } {
  const [url, init] = fetchMock.mock.calls[0] ?? [];
  return {
    url: String(url),
    init: (init ?? {}) as RequestInit,
    corpo: JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>,
  };
}

beforeEach(() => {
  logs = [];
  fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('{}', { status: 201 }));
  for (const level of ['log', 'warn', 'error', 'debug', 'verbose'] as const) {
    jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => {
      logs.push(String(args[0]));
    });
  }
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('MailService — verificação de e-mail', () => {
  it('chama a API do Brevo com a api-key, o remetente e o destinatário certos', async () => {
    await makeService().enviarVerificacaoDeEmail(ANA, TOKEN);

    const { url, init, corpo } = enviado();
    expect(url).toBe(BREVO_SEND_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'api-key': CHAVE, 'content-type': 'application/json' });
    expect(corpo).toMatchObject({
      sender: { name: 'Checkpoint', email: 'remetente@exemplo.com' },
      to: [{ email: 'ana@exemplo.com', name: 'Ana Teste' }],
      subject: expect.any(String),
    });
  });

  it('o link aponta para o FRONTEND (WEB_PUBLIC_URL), nunca para a API', async () => {
    await makeService().enviarVerificacaoDeEmail(ANA, TOKEN);

    const { corpo } = enviado();
    const link = `https://checkpoint.exemplo.vercel.app/verificar-email?token=${TOKEN}`;
    expect(corpo.htmlContent).toContain(link);
    expect(corpo.textContent).toContain(link);
    expect(JSON.stringify(corpo)).not.toContain('/api/');
  });

  it('usa MAIL_FROM_NAME quando definida e cai em "Checkpoint" quando ausente ou vazia', async () => {
    await makeService({ MAIL_FROM_NAME: 'Outro Nome' }).enviarVerificacaoDeEmail(ANA, TOKEN);
    expect(enviado().corpo.sender).toMatchObject({ name: 'Outro Nome' });

    fetchMock.mockClear();
    await makeService({ MAIL_FROM_NAME: '' }).enviarVerificacaoDeEmail(ANA, TOKEN);
    expect(enviado().corpo.sender).toMatchObject({ name: 'Checkpoint' });
  });

  it('escapa o nome do usuário no HTML (texto livre não injeta marcação)', async () => {
    await makeService().enviarVerificacaoDeEmail(
      { email: 'ana@exemplo.com', nome: '<img src=x onerror=alert(1)>' },
      TOKEN,
    );

    const html = String(enviado().corpo.htmlContent);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});

describe('MailService — redefinição de senha', () => {
  it('o link vai para /redefinir-senha e o texto avisa da validade', async () => {
    await makeService().enviarRedefinicaoDeSenha(ANA, TOKEN);

    const { corpo } = enviado();
    expect(corpo.htmlContent).toContain(
      `https://checkpoint.exemplo.vercel.app/redefinir-senha?token=${TOKEN}`,
    );
    expect(String(corpo.textContent)).toContain('30 minutos');
  });
});

describe('MailService — falhas viram MailIndisponivelError', () => {
  it.each([400, 401, 429, 500, 503])('resposta HTTP %s do Brevo', async (status) => {
    fetchMock.mockResolvedValue(new Response('{"message":"erro"}', { status }));

    await expect(makeService().enviarVerificacaoDeEmail(ANA, TOKEN)).rejects.toBeInstanceOf(
      MailIndisponivelError,
    );
  });

  it('erro de rede', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));

    await expect(makeService().enviarRedefinicaoDeSenha(ANA, TOKEN)).rejects.toBeInstanceOf(
      MailIndisponivelError,
    );
  });

  it('timeout (o fetch recebe um AbortSignal e aborta)', async () => {
    fetchMock.mockRejectedValue(new DOMException('timeout', 'TimeoutError'));

    await expect(makeService().enviarVerificacaoDeEmail(ANA, TOKEN)).rejects.toBeInstanceOf(
      MailIndisponivelError,
    );
    await makeService()
      .enviarVerificacaoDeEmail(ANA, TOKEN)
      .catch(() => undefined);
    expect((fetchMock.mock.calls.at(-1)?.[1] as RequestInit).signal).toBeInstanceOf(AbortSignal);
  });

  it('nunca loga a chave, o token, o e-mail nem o corpo da resposta', async () => {
    fetchMock.mockResolvedValue(new Response(`corpo secreto do brevo ${CHAVE}`, { status: 401 }));

    await makeService()
      .enviarVerificacaoDeEmail(ANA, TOKEN)
      .catch(() => undefined);

    expect(logs.length).toBeGreaterThan(0);
    const tudo = logs.join('\n');
    for (const proibido of [CHAVE, TOKEN, 'ana@exemplo.com', 'corpo secreto']) {
      expect(tudo).not.toContain(proibido);
    }
  });

  it('o erro em si não carrega a chave nem o corpo', async () => {
    fetchMock.mockResolvedValue(new Response(`segredo ${CHAVE}`, { status: 500 }));

    const erro = await makeService()
      .enviarVerificacaoDeEmail(ANA, TOKEN)
      .then(
        () => new Error('esperava a falha'),
        (e: unknown) => e as Error,
      );

    expect(erro.message).not.toContain(CHAVE);
    expect(erro.message).not.toContain('segredo');
  });
});
