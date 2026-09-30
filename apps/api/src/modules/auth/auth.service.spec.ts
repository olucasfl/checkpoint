import { HttpException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { type PrismaService } from '../../database/prisma.service';
import { DEFAULT_REGISTRATION_LIMIT_PER_HOUR } from '../../config/env.validation';
import { registrationLimitPerHour } from './auth-throttler.guard';
import { AuthTokensService } from './auth-tokens.service';
import { USUARIO_PUBLICO_SELECT } from '../users/usuario-publico';
import { MailIndisponivelError } from '../mail/mail.errors';
import { type MailService } from '../mail/mail.service';
import { AuthService } from './auth.service';
import { MAX_SESSIONS_PER_USER, REFRESH_GRACE_WINDOW_MS } from './auth.constants';
import { type PasswordHasher } from './password-hasher';
import { fakeHasher, FakeAuthPrisma } from './testing/fake-auth-prisma';

// Valores sintéticos e óbvios (RULES.md §8).
const NOW = Date.UTC(2026, 8, 24, 12, 0, 0);
const CURL = 'curl/8.5.0';
const ANA = { nome: ' Ana Teste ', email: '  Ana@Exemplo.COM ', senha: 'segredo-forte' };

let db: FakeAuthPrisma;
let service: AuthService;
let tokens: AuthTokensService;
let registrationOpen: boolean;
let mail: { enviarVerificacaoDeEmail: jest.Mock; enviarRedefinicaoDeSenha: jest.Mock };

function makeService(): void {
  db = new FakeAuthPrisma();
  mail = {
    enviarVerificacaoDeEmail: jest.fn().mockResolvedValue(undefined),
    enviarRedefinicaoDeSenha: jest.fn().mockResolvedValue(undefined),
  };
  const config = {
    get: (key: string) =>
      ({
        JWT_ACCESS_SECRET: 'segredo-de-acesso-sintetico-com-mais-de-32-caracteres',
        JWT_REFRESH_SECRET: 'segredo-de-refresh-sintetico-com-mais-de-32-caracteres',
        AUTH_REGISTRATION_OPEN: registrationOpen,
      })[key],
  } as unknown as ConfigService<never, true>;
  tokens = new AuthTokensService(new JwtService({}), config as never);
  service = new AuthService(
    db as unknown as PrismaService,
    tokens,
    fakeHasher as unknown as PasswordHasher,
    config as never,
    mail as unknown as MailService,
  );
}

/** Registra, confirma o e-mail e entra: o que os testes de sessão precisam (o registro não abre sessão). */
async function sessaoDe(dto: { nome: string; email: string; senha: string }, userAgent?: string) {
  await service.register(dto);
  const user = db.users.find((row) => row.email === dto.email.trim().toLowerCase());
  if (user) {
    user.emailVerificadoEm = new Date(Date.now());
  }
  return service.login({ email: dto.email, senha: dto.senha }, userAgent);
}

async function errorOf(
  promise: Promise<unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    return {
      status: (error as HttpException).getStatus(),
      body: (error as HttpException).getResponse() as Record<string, unknown>,
    };
  }
  throw new Error('esperava um erro HTTP');
}

const sha256 = (texto: string) => createHash('sha256').update(texto).digest('hex');

function at(offsetMs: number): void {
  jest.spyOn(Date, 'now').mockReturnValue(NOW + offsetMs);
}

beforeEach(() => {
  registrationOpen = true;
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  fakeHasher.hash.mockClear();
  fakeHasher.verify.mockClear();
  makeService();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('register', () => {
  it('normaliza nome e e-mail, grava o HASH e NÃO abre sessão (CA-01)', async () => {
    const result = await service.register(ANA);

    expect(result).toEqual({ email: 'ana@exemplo.com', emailEnviado: true });
    expect(db.users).toHaveLength(1);
    expect(db.users[0]).toMatchObject({ nome: 'Ana Teste', emailVerificadoEm: null });
    expect(db.users[0]?.senhaHash).toBe('fake$segredo-forte');
    expect(db.users[0]?.senhaHash).not.toBe('segredo-forte');
    expect(db.sessions).toHaveLength(0);
  });

  it('cria um token de verificação de 24 h, só com o HASH (nunca o token) (CA-01)', async () => {
    await service.register(ANA);

    const [enviado] = mail.enviarVerificacaoDeEmail.mock.calls;
    const token = enviado?.[1] as string;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(db.tokens).toHaveLength(1);
    const [row] = db.tokens;
    expect(row).toMatchObject({
      tipo: 'VERIFICACAO_EMAIL',
      userId: db.users[0]?.id,
      usadoEm: null,
    });
    expect(row?.tokenHash).toBe(sha256(token));
    expect(row?.tokenHash).not.toBe(token);
    expect(row?.expiraEm.getTime()).toBe(NOW + 24 * 60 * 60 * 1000);
    expect(enviado?.[0]).toEqual({ email: 'ana@exemplo.com', nome: 'Ana Teste' });
  });

  it('o envio falhou → a conta continua criada e emailEnviado é false (CA-22a)', async () => {
    mail.enviarVerificacaoDeEmail.mockRejectedValueOnce(new MailIndisponivelError());

    const result = await service.register(ANA);

    expect(result).toEqual({ email: 'ana@exemplo.com', emailEnviado: false });
    expect(db.users).toHaveLength(1);
  });

  it('e-mail já usado (ignorando caixa e espaços) → 409 AUTH_EMAIL_EM_USO com fields.email (CA-02)', async () => {
    await service.register(ANA);

    const error = await errorOf(service.register({ ...ANA, email: 'ANA@exemplo.com ' }));

    expect(error.status).toBe(409);
    expect(error.body).toMatchObject({ code: 'AUTH_EMAIL_EM_USO' });
    expect(error.body.fields).toHaveProperty('email');
    expect(db.users).toHaveLength(1);
  });

  it('corrida no @unique (P2002) vira o mesmo 409, nunca 500', async () => {
    db.user.findUnique.mockResolvedValueOnce(null); // a checagem prévia passa...
    await service.register(ANA); // ...e o outro request já criou a conta
    db.user.findUnique.mockResolvedValueOnce(null);

    const error = await errorOf(service.register(ANA));

    expect(error).toMatchObject({ status: 409, body: { code: 'AUTH_EMAIL_EM_USO' } });
  });

  it('erro inesperado do banco sobe como está (não é engolido como 409)', async () => {
    db.user.create.mockRejectedValueOnce(new Error('banco caiu'));

    await expect(service.register(ANA)).rejects.toThrow('banco caiu');
  });

  it('registro fechado → 403 AUTH_REGISTRO_FECHADO ANTES de qualquer consulta; nenhum usuário (CA-04)', async () => {
    registrationOpen = false;
    makeService();

    const error = await errorOf(service.register(ANA));

    expect(error).toMatchObject({ status: 403, body: { code: 'AUTH_REGISTRO_FECHADO' } });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.users).toHaveLength(0);
    expect(mail.enviarVerificacaoDeEmail).not.toHaveBeenCalled();
  });

  it('a lista branca (select) nunca inclui senhaHash', () => {
    expect(Object.keys(USUARIO_PUBLICO_SELECT).sort()).toEqual(['criadoEm', 'email', 'id', 'nome']);
  });

  it('o e-mail é gravado normalizado (a chave de login)', async () => {
    await service.register(ANA);

    expect(db.users[0]?.email).toBe('ana@exemplo.com');
  });
});

describe('login com e-mail não verificado (CA-02, CA-03)', () => {
  beforeEach(async () => {
    await service.register(ANA);
  });

  it('senha certa + e-mail não verificado → 401 AUTH_EMAIL_NAO_VERIFICADO, sem fields e sem sessão (CA-02)', async () => {
    const error = await errorOf(
      service.login({ email: 'ana@exemplo.com', senha: 'segredo-forte' }, CURL),
    );

    expect(error.status).toBe(401);
    expect(error.body).toMatchObject({ code: 'AUTH_EMAIL_NAO_VERIFICADO' });
    expect(error.body).not.toHaveProperty('fields');
    expect(db.sessions).toHaveLength(0);
  });

  it('senha ERRADA → AUTH_CREDENCIAIS_INVALIDAS, não AUTH_EMAIL_NAO_VERIFICADO (CA-03)', async () => {
    const error = await errorOf(
      service.login({ email: 'ana@exemplo.com', senha: 'errada-mesmo' }, CURL),
    );

    expect(error).toMatchObject({ status: 401, body: { code: 'AUTH_CREDENCIAIS_INVALIDAS' } });
  });
});

describe('verificarEmail (CA-04 a CA-08)', () => {
  async function registrarEPegarToken(): Promise<string> {
    await service.register(ANA);
    return mail.enviarVerificacaoDeEmail.mock.calls[0]?.[1] as string;
  }

  it('confirma o e-mail, e o login passa a funcionar (CA-04)', async () => {
    const token = await registrarEPegarToken();

    await expect(service.verificarEmail(token)).resolves.toEqual({ jaEstavaVerificado: false });

    expect(db.users[0]?.emailVerificadoEm).toEqual(new Date(NOW));
    const session = await service.login({ email: 'ana@exemplo.com', senha: 'segredo-forte' }, CURL);
    expect(session.usuario.email).toBe('ana@exemplo.com');
  });

  it('é idempotente: o mesmo link de novo não dá erro e não regrava a data (CA-05)', async () => {
    const token = await registrarEPegarToken();
    await service.verificarEmail(token);
    at(60_000);

    await expect(service.verificarEmail(token)).resolves.toEqual({ jaEstavaVerificado: true });

    expect(db.users[0]?.emailVerificadoEm).toEqual(new Date(NOW));
  });

  it('token inexistente → 401 AUTH_TOKEN_INVALIDO (CA-07)', async () => {
    await registrarEPegarToken();

    const error = await errorOf(service.verificarEmail('0'.repeat(64)));

    expect(error).toMatchObject({ status: 401, body: { code: 'AUTH_TOKEN_INVALIDO' } });
    expect(db.users[0]?.emailVerificadoEm).toBeNull();
  });

  it('token vencido (24 h) → 401 AUTH_TOKEN_INVALIDO (CA-08)', async () => {
    const token = await registrarEPegarToken();

    at(24 * 60 * 60 * 1000 + 1);
    const error = await errorOf(service.verificarEmail(token));

    expect(error).toMatchObject({ status: 401, body: { code: 'AUTH_TOKEN_INVALIDO' } });
    expect(db.users[0]?.emailVerificadoEm).toBeNull();
  });

  it('um token de REDEFINIÇÃO não confirma e-mail', async () => {
    await service.register(ANA);
    await service.esqueciSenha('ana@exemplo.com');
    const resetToken = mail.enviarRedefinicaoDeSenha.mock.calls[0]?.[1] as string;

    const error = await errorOf(service.verificarEmail(resetToken));

    expect(error).toMatchObject({ status: 401, body: { code: 'AUTH_TOKEN_INVALIDO' } });
  });
});

describe('reenviarVerificacao (CA-09 a CA-11, CA-22b)', () => {
  it('conta não verificada → "enviado" e um SEGUNDO token; o primeiro continua válido (CA-09)', async () => {
    await service.register(ANA);
    const primeiro = mail.enviarVerificacaoDeEmail.mock.calls[0]?.[1] as string;

    await expect(service.reenviarVerificacao({ email: 'ana@exemplo.com' })).resolves.toEqual({
      estado: 'enviado',
    });

    expect(db.tokens).toHaveLength(2);
    expect(mail.enviarVerificacaoDeEmail).toHaveBeenCalledTimes(2);
    await expect(service.verificarEmail(primeiro)).resolves.toEqual({ jaEstavaVerificado: false });
  });

  it('conta já verificada → "ja-verificado" e nenhum e-mail (CA-10)', async () => {
    await sessaoDe(ANA, CURL);
    mail.enviarVerificacaoDeEmail.mockClear();

    await expect(service.reenviarVerificacao({ email: 'ana@exemplo.com' })).resolves.toEqual({
      estado: 'ja-verificado',
    });

    expect(mail.enviarVerificacaoDeEmail).not.toHaveBeenCalled();
  });

  it('e-mail inexistente → o MESMO corpo do reenvio real, e nada é criado (CA-11)', async () => {
    const real = await (async () => {
      await service.register(ANA);
      return service.reenviarVerificacao({ email: 'ana@exemplo.com' });
    })();
    const tokensAntes = db.tokens.length;

    const inexistente = await service.reenviarVerificacao({ email: 'naoexiste@exemplo.com' });

    expect(inexistente).toEqual(real);
    expect(db.tokens).toHaveLength(tokensAntes);
  });

  it('o envio falhou numa conta não verificada → 502 MAIL_INDISPONIVEL (CA-22b)', async () => {
    await service.register(ANA);
    mail.enviarVerificacaoDeEmail.mockRejectedValueOnce(new MailIndisponivelError());

    const error = await errorOf(service.reenviarVerificacao({ email: 'ana@exemplo.com' }));

    expect(error).toMatchObject({ status: 502, body: { code: 'MAIL_INDISPONIVEL' } });
  });
});

describe('esqueciSenha (CA-13, CA-14, CA-22c)', () => {
  it('conta existente → token de 30 min, só o hash no banco, e-mail enviado (CA-13)', async () => {
    await service.register(ANA);

    await expect(service.esqueciSenha(' ANA@exemplo.com ')).resolves.toBeUndefined();

    const reset = db.tokens.find((t) => t.tipo === 'RESET_SENHA');
    const token = mail.enviarRedefinicaoDeSenha.mock.calls[0]?.[1] as string;
    expect(reset?.expiraEm.getTime()).toBe(NOW + 30 * 60 * 1000);
    expect(reset?.tokenHash).toBe(sha256(token));
  });

  it('conta inexistente → não cria token e não chama o e-mail (CA-14)', async () => {
    await expect(service.esqueciSenha('naoexiste@exemplo.com')).resolves.toBeUndefined();

    expect(db.tokens).toHaveLength(0);
    expect(mail.enviarRedefinicaoDeSenha).not.toHaveBeenCalled();
  });

  it('o envio falhou → não lança (a falha nunca aparece na resposta) (CA-22c)', async () => {
    await service.register(ANA);
    mail.enviarRedefinicaoDeSenha.mockRejectedValueOnce(new MailIndisponivelError());

    await expect(service.esqueciSenha('ana@exemplo.com')).resolves.toBeUndefined();
  });

  it('um erro que NÃO é do e-mail sobe como está', async () => {
    await service.register(ANA);
    mail.enviarRedefinicaoDeSenha.mockRejectedValueOnce(new Error('bug'));

    await expect(service.esqueciSenha('ana@exemplo.com')).rejects.toThrow('bug');
  });
});

describe('redefinirSenha (CA-15 a CA-18)', () => {
  async function pedirReset(): Promise<string> {
    await sessaoDe(ANA, CURL);
    await service.esqueciSenha('ana@exemplo.com');
    return mail.enviarRedefinicaoDeSenha.mock.calls[0]?.[1] as string;
  }

  it('troca a senha, consome o token e apaga TODAS as sessões (CA-15)', async () => {
    const token = await pedirReset();
    expect(db.sessions).toHaveLength(1);

    await expect(
      service.redefinirSenha({ token, novaSenha: 'outra-senha-boa' }),
    ).resolves.toBeUndefined();

    expect(db.users[0]?.senhaHash).toBe('fake$outra-senha-boa');
    expect(db.sessions).toHaveLength(0);
    expect(db.tokens.find((t) => t.tipo === 'RESET_SENHA')?.usadoEm).toEqual(new Date(NOW));
    const antiga = await errorOf(
      service.login({ email: 'ana@exemplo.com', senha: 'segredo-forte' }, CURL),
    );
    expect(antiga.body).toMatchObject({ code: 'AUTH_CREDENCIAIS_INVALIDAS' });
    await expect(
      service.login({ email: 'ana@exemplo.com', senha: 'outra-senha-boa' }, CURL),
    ).resolves.toBeDefined();
  });

  it('uso único: o MESMO token de novo → 401 AUTH_TOKEN_INVALIDO (CA-16)', async () => {
    const token = await pedirReset();
    await service.redefinirSenha({ token, novaSenha: 'outra-senha-boa' });

    const error = await errorOf(service.redefinirSenha({ token, novaSenha: 'mais-uma-senha' }));

    expect(error).toMatchObject({ status: 401, body: { code: 'AUTH_TOKEN_INVALIDO' } });
    expect(db.users[0]?.senhaHash).toBe('fake$outra-senha-boa');
  });

  it('token vencido (30 min) → 401 AUTH_TOKEN_INVALIDO (CA-17)', async () => {
    const token = await pedirReset();

    at(30 * 60 * 1000 + 1);
    const error = await errorOf(service.redefinirSenha({ token, novaSenha: 'outra-senha-boa' }));

    expect(error).toMatchObject({ status: 401, body: { code: 'AUTH_TOKEN_INVALIDO' } });
    expect(db.users[0]?.senhaHash).toBe('fake$segredo-forte');
  });

  it('token inexistente dá o mesmo erro do vencido e do usado', async () => {
    await pedirReset();

    const error = await errorOf(
      service.redefinirSenha({ token: 'f'.repeat(64), novaSenha: 'outra-senha-boa' }),
    );

    expect(error).toMatchObject({ status: 401, body: { code: 'AUTH_TOKEN_INVALIDO' } });
  });

  it('um token de VERIFICAÇÃO não redefine senha', async () => {
    await service.register(ANA);
    const verificacao = mail.enviarVerificacaoDeEmail.mock.calls[0]?.[1] as string;

    const error = await errorOf(
      service.redefinirSenha({ token: verificacao, novaSenha: 'outra-senha-boa' }),
    );

    expect(error).toMatchObject({ status: 401, body: { code: 'AUTH_TOKEN_INVALIDO' } });
  });

  it('corrida: perdeu o consumo do token → 401 e a senha NÃO muda', async () => {
    const token = await pedirReset();
    db.tokenDeUsoUnico.updateMany.mockResolvedValueOnce({ count: 0 });

    const error = await errorOf(service.redefinirSenha({ token, novaSenha: 'outra-senha-boa' }));

    expect(error).toMatchObject({ status: 401, body: { code: 'AUTH_TOKEN_INVALIDO' } });
    expect(db.users[0]?.senhaHash).toBe('fake$segredo-forte');
    expect(db.sessions).toHaveLength(1);
  });
});

describe('login', () => {
  beforeEach(async () => {
    await sessaoDe(ANA, CURL);
    db.sessions = [];
    fakeHasher.verify.mockClear();
  });

  it('e-mail com caixa e espaços diferentes + senha certa → sessão NOVA (CA-05)', async () => {
    const result = await service.login({ email: ' ANA@exemplo.com', senha: 'segredo-forte' }, CURL);

    expect(result.usuario.email).toBe('ana@exemplo.com');
    expect(db.sessions).toHaveLength(1);
  });

  it('senha errada e e-mail inexistente dão EXATAMENTE o mesmo erro (CA-06)', async () => {
    const senhaErrada = await errorOf(
      service.login({ email: 'ana@exemplo.com', senha: 'errada-mesmo' }, CURL),
    );
    const semConta = await errorOf(
      service.login({ email: 'nao-existe@exemplo.com', senha: 'segredo-forte' }, CURL),
    );

    expect(senhaErrada).toEqual(semConta);
    expect(senhaErrada).toEqual({
      status: 401,
      body: {
        statusCode: 401,
        code: 'AUTH_CREDENCIAIS_INVALIDAS',
        message: 'E-mail ou senha incorretos.',
      },
    });
  });

  it('e-mail inexistente AINDA verifica a senha contra um hash fixo (o tempo não denuncia a conta) (CA-06)', async () => {
    await errorOf(service.login({ email: 'nao-existe@exemplo.com', senha: 'segredo-forte' }, CURL));

    expect(fakeHasher.verify).toHaveBeenCalledTimes(1);
    const [hashUsado] = fakeHasher.verify.mock.calls[0] ?? [];
    expect(hashUsado).toEqual(expect.stringMatching(/^fake\$/));
  });

  it('a senha certa numa conta existente NÃO usa o hash fixo', async () => {
    await service.login({ email: 'ana@exemplo.com', senha: 'segredo-forte' }, CURL);

    expect(fakeHasher.verify).toHaveBeenCalledWith('fake$segredo-forte', 'segredo-forte');
  });

  it('apaga as sessões VENCIDAS desse usuário e mantém as vivas', async () => {
    const userId = db.users[0]?.id ?? '';
    const base = {
      userId,
      tokenHash: 'a'.repeat(64),
      dispositivo: 'x',
      hashAnterior: null,
      rotacionadoEm: null,
      criadoEm: new Date(NOW),
      ultimoUsoEm: new Date(NOW),
    };
    db.sessions = [
      { ...base, id: 'vencida', expiraEm: new Date(NOW - 1) },
      { ...base, id: 'viva', expiraEm: new Date(NOW + 60_000) },
    ];

    await service.login({ email: 'ana@exemplo.com', senha: 'segredo-forte' }, CURL);

    expect(db.sessions.map((s) => s.id)).not.toContain('vencida');
    expect(db.sessions.map((s) => s.id)).toContain('viva');
    expect(db.sessions).toHaveLength(2);
  });

  it('teto de 10 sessões: o 11º login apaga a de ultimoUsoEm mais antigo (CA-15)', async () => {
    const primeira = await service.login(
      { email: 'ana@exemplo.com', senha: 'segredo-forte' },
      CURL,
    );
    const idPrimeira = db.sessions[0]?.id;
    for (let i = 1; i < MAX_SESSIONS_PER_USER; i += 1) {
      at(i * 1000);
      await service.login({ email: 'ana@exemplo.com', senha: 'segredo-forte' }, CURL);
    }
    expect(db.sessions).toHaveLength(MAX_SESSIONS_PER_USER);

    at(MAX_SESSIONS_PER_USER * 1000);
    await service.login({ email: 'ana@exemplo.com', senha: 'segredo-forte' }, CURL);

    expect(db.sessions).toHaveLength(MAX_SESSIONS_PER_USER);
    expect(db.sessions.map((s) => s.id)).not.toContain(idPrimeira);
    // a mais antiga deixou de renovar
    const erro = await errorOf(service.refresh(primeira.refreshToken));
    expect(erro).toMatchObject({ status: 401, body: { code: 'AUTH_SESSAO_ENCERRADA' } });
  });

  it('o teto vale por usuário: as sessões de OUTRA conta não contam nem são apagadas', async () => {
    await sessaoDe({ nome: 'Bia', email: 'bia@exemplo.com', senha: 'outra-senha-boa' }, CURL);
    const sessoesDaBia = db.sessions.filter((s) => s.userId !== db.users[0]?.id).length;

    for (let i = 0; i < MAX_SESSIONS_PER_USER + 2; i += 1) {
      at(i * 1000);
      await service.login({ email: 'ana@exemplo.com', senha: 'segredo-forte' }, CURL);
    }

    expect(db.sessions.filter((s) => s.userId !== db.users[0]?.id)).toHaveLength(sessoesDaBia);
  });
});

describe('refresh — rotação, janela de 30 s e reuso (CA-09 a CA-12)', () => {
  it('rotaciona na MESMA linha: hashAnterior ← tokenHash, tokenHash novo, expiraEm avança (CA-09)', async () => {
    const primeiro = await sessaoDe(ANA, CURL);
    const antes = { ...db.sessions[0] };

    at(60_000);
    const segundo = await service.refresh(primeiro.refreshToken);

    expect(db.sessions).toHaveLength(1);
    const depois = db.sessions[0];
    expect(depois?.id).toBe(antes.id);
    expect(depois?.hashAnterior).toBe(sha256(primeiro.refreshToken));
    expect(depois?.tokenHash).toBe(sha256(segundo.refreshToken));
    expect(segundo.refreshToken).not.toBe(primeiro.refreshToken);
    expect(segundo.accessToken).not.toBe(primeiro.accessToken);
    expect(depois?.rotacionadoEm?.getTime()).toBe(NOW + 60_000);
    expect(depois?.ultimoUsoEm.getTime()).toBe(NOW + 60_000);
    expect((depois?.expiraEm.getTime() ?? 0) > (antes.expiraEm?.getTime() ?? 0)).toBe(true);
    expect(segundo.usuario.email).toBe('ana@exemplo.com');
  });

  it('o token NOVO continua renovando (rotações em sequência)', async () => {
    const a = await sessaoDe(ANA, CURL);
    at(1000);
    const b = await service.refresh(a.refreshToken);
    at(2000);

    await expect(service.refresh(b.refreshToken)).resolves.toMatchObject({
      usuario: { email: 'ana@exemplo.com' },
    });
  });

  it('o token ANTERIOR em até 30 s → 409 AUTH_REFRESH_CONCORRENTE; nada muda e o novo ainda renova (CA-10)', async () => {
    const a = await sessaoDe(ANA, CURL);
    at(1000);
    const b = await service.refresh(a.refreshToken);
    const estado = JSON.stringify(db.sessions);

    at(1000 + REFRESH_GRACE_WINDOW_MS);
    const erro = await errorOf(service.refresh(a.refreshToken));

    expect(erro).toMatchObject({ status: 409, body: { code: 'AUTH_REFRESH_CONCORRENTE' } });
    expect(JSON.stringify(db.sessions)).toBe(estado);
    at(1000 + REFRESH_GRACE_WINDOW_MS + 1);
    await expect(service.refresh(b.refreshToken)).resolves.toBeDefined();
  });

  it('o token anterior depois de 30 s é REUSO: 401, a sessão é apagada e o token novo também morre (CA-11)', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const a = await sessaoDe(ANA, CURL);
    const sessionId = db.sessions[0]?.id;
    at(1000);
    const b = await service.refresh(a.refreshToken);

    at(1000 + REFRESH_GRACE_WINDOW_MS + 1);
    const erro = await errorOf(service.refresh(a.refreshToken));

    expect(erro).toMatchObject({ status: 401, body: { code: 'AUTH_SESSAO_ENCERRADA' } });
    expect(db.sessions).toHaveLength(0);
    await expect(errorOf(service.refresh(b.refreshToken))).resolves.toMatchObject({ status: 401 });
    // o aviso tem o id da sessão e NENHUM token
    const logado = warn.mock.calls.flat().join(' ');
    expect(logado).toContain(sessionId);
    expect(logado).not.toContain(a.refreshToken);
    expect(logado).not.toContain(b.refreshToken);
  });

  it('um token que não bate com nenhum dos dois hashes também é reuso (sessão apagada)', async () => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const a = await sessaoDe(ANA, CURL);
    const sessao = db.sessions[0];
    if (sessao) {
      sessao.tokenHash = sha256('outro-token');
    }

    const erro = await errorOf(service.refresh(a.refreshToken));

    expect(erro.status).toBe(401);
    expect(db.sessions).toHaveLength(0);
  });

  it('updateMany com count 0 (outra request rotacionou no meio) → 409, e não uma segunda rotação', async () => {
    const a = await sessaoDe(ANA, CURL);
    db.refreshSession.updateMany.mockResolvedValueOnce({ count: 0 });

    const erro = await errorOf(service.refresh(a.refreshToken));

    expect(erro).toMatchObject({ status: 409, body: { code: 'AUTH_REFRESH_CONCORRENTE' } });
    expect(db.sessions[0]?.hashAnterior).toBeNull();
  });

  it('a rotação é condicionada ao hash apresentado (updateMany com tokenHash no where)', async () => {
    const a = await sessaoDe(ANA, CURL);

    await service.refresh(a.refreshToken);

    expect(db.refreshSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: db.sessions[0]?.id, tokenHash: sha256(a.refreshToken) },
      }),
    );
  });

  it.each([
    ['sem cookie', undefined],
    ['cookie vazio', ''],
    ['token que não é um JWT', 'lixo'],
  ])('%s → 401 AUTH_SESSAO_ENCERRADA (CA-12)', async (_nome, token) => {
    const erro = await errorOf(service.refresh(token));

    expect(erro).toMatchObject({ status: 401, body: { code: 'AUTH_SESSAO_ENCERRADA' } });
  });

  it('um ACCESS token no lugar do refresh falha (segredos separados)', async () => {
    const a = await sessaoDe(ANA, CURL);

    await expect(errorOf(service.refresh(a.accessToken))).resolves.toMatchObject({ status: 401 });
  });

  it('sessão inexistente → 401', async () => {
    const a = await sessaoDe(ANA, CURL);
    db.sessions = [];

    await expect(errorOf(service.refresh(a.refreshToken))).resolves.toMatchObject({
      status: 401,
      body: { code: 'AUTH_SESSAO_ENCERRADA' },
    });
  });

  it('sessão vencida (30 dias sem uso) → 401', async () => {
    const a = await sessaoDe(ANA, CURL);

    at(31 * 24 * 60 * 60 * 1000);

    await expect(errorOf(service.refresh(a.refreshToken))).resolves.toMatchObject({ status: 401 });
  });

  it('a renovação empurra o vencimento para 30 dias a partir do uso', async () => {
    const a = await sessaoDe(ANA, CURL);
    const dia = 24 * 60 * 60 * 1000;

    at(20 * dia);
    await service.refresh(a.refreshToken);

    expect(db.sessions[0]?.expiraEm.getTime()).toBe(NOW + 20 * dia + 30 * dia);
  });
});

describe('logout (CA-13, CA-14)', () => {
  it('apaga a sessão do cookie e mantém as outras', async () => {
    const a = await sessaoDe(ANA, CURL);
    const b = await service.login({ email: 'ana@exemplo.com', senha: 'segredo-forte' }, CURL);
    expect(db.sessions).toHaveLength(2);

    await service.logout(a.refreshToken);

    expect(db.sessions).toHaveLength(1);
    await expect(service.refresh(b.refreshToken)).resolves.toBeDefined();
  });

  it('é idempotente: repetir, sem cookie ou com token inválido não lança', async () => {
    const a = await sessaoDe(ANA, CURL);

    await service.logout(a.refreshToken);
    await expect(service.logout(a.refreshToken)).resolves.toBeUndefined();
    await expect(service.logout(undefined)).resolves.toBeUndefined();
    await expect(service.logout('lixo')).resolves.toBeUndefined();
  });

  it('funciona com o refresh token já vencido', async () => {
    const a = await sessaoDe(ANA, CURL);

    at(40 * 24 * 60 * 60 * 1000);
    await service.logout(a.refreshToken);

    expect(db.sessions).toHaveLength(0);
  });

  it('um access token no cookie não encerra nada', async () => {
    const a = await sessaoDe(ANA, CURL);

    await service.logout(a.accessToken);

    expect(db.sessions).toHaveLength(1);
  });
});

describe('me', () => {
  it('devolve o Usuario sem nenhum campo sensível (CA-07, CA-20)', async () => {
    const a = await sessaoDe(ANA, CURL);

    const usuario = await service.me(a.usuario.id);

    expect(Object.keys(usuario).sort()).toEqual(['criadoEm', 'email', 'id', 'nome']);
    expect(JSON.stringify(usuario)).not.toContain('senhaHash');
  });

  it('usuário que não existe mais → AUTH_SESSAO_ENCERRADA', async () => {
    await expect(errorOf(service.me('id-que-nao-existe'))).resolves.toMatchObject({
      status: 401,
      body: { code: 'AUTH_SESSAO_ENCERRADA' },
    });
  });
});

describe('limite de registros por hora (CA-16)', () => {
  it('sem a env, o padrão é 3', () => {
    expect(DEFAULT_REGISTRATION_LIMIT_PER_HOUR).toBe(3);
    expect(registrationLimitPerHour(undefined)).toBe(3);
  });

  it('a env opcional sobrescreve o padrão', () => {
    expect(registrationLimitPerHour('2')).toBe(2);
    expect(registrationLimitPerHour('100')).toBe(100);
  });

  it.each(['', '  ', 'abc', '0', '-1', '1.5'])(
    'valor inválido (%j) volta ao padrão de 3',
    (raw) => {
      expect(registrationLimitPerHour(raw)).toBe(3);
    },
  );
});

describe('trocarSenha (CA-51 a CA-53)', () => {
  /** Ana com três sessões (três dispositivos); a troca é feita pela primeira. */
  async function anaComTresSessoes() {
    const a = await sessaoDe(ANA, CURL);
    await service.login({ email: ANA.email, senha: ANA.senha }, CURL);
    await service.login({ email: ANA.email, senha: ANA.senha }, CURL);
    const [atual, ...outras] = db.sessions.map((s) => s.id);
    return { user: { id: a.usuario.id, sessionId: atual as string }, outras };
  }

  it('grava o hash da nova senha e apaga as OUTRAS sessões, mantendo a atual (CA-51)', async () => {
    const { user, outras } = await anaComTresSessoes();
    expect(outras).toHaveLength(2);

    await service.trocarSenha(user, { senhaAtual: ANA.senha, novaSenha: 'outra-senha-boa' });

    expect(db.users[0]?.senhaHash).toBe('fake$outra-senha-boa');
    expect(db.sessions.map((s) => s.id)).toEqual([user.sessionId]);
    // As duas escritas vão juntas, na mesma transação.
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.refreshSession.deleteMany).toHaveBeenLastCalledWith({
      where: { userId: user.id, id: { not: user.sessionId } },
    });
  });

  it('não toca nas sessões de OUTRA conta', async () => {
    const { user } = await anaComTresSessoes();
    await sessaoDe({ nome: 'Bia', email: 'bia@exemplo.com', senha: 'segredo-da-bia' }, CURL);

    await service.trocarSenha(user, { senhaAtual: ANA.senha, novaSenha: 'outra-senha-boa' });

    expect(db.sessions).toHaveLength(2);
  });

  it('depois da troca, a senha antiga não entra e a nova entra', async () => {
    const { user } = await anaComTresSessoes();

    await service.trocarSenha(user, { senhaAtual: ANA.senha, novaSenha: 'outra-senha-boa' });

    await expect(
      errorOf(service.login({ email: ANA.email, senha: ANA.senha }, CURL)),
    ).resolves.toMatchObject({ status: 401, body: { code: 'AUTH_CREDENCIAIS_INVALIDAS' } });
    await expect(
      service.login({ email: ANA.email, senha: 'outra-senha-boa' }, CURL),
    ).resolves.toMatchObject({ usuario: { email: 'ana@exemplo.com' } });
  });

  it('senha atual errada → 400 AUTH_SENHA_ATUAL_INCORRETA com fields.senhaAtual; nada muda (CA-52)', async () => {
    const { user } = await anaComTresSessoes();
    const hashAntes = db.users[0]?.senhaHash;

    const erro = await errorOf(
      service.trocarSenha(user, { senhaAtual: 'nao-e-esta', novaSenha: 'outra-senha-boa' }),
    );

    expect(erro).toEqual({
      status: 400,
      body: {
        statusCode: 400,
        code: 'AUTH_SENHA_ATUAL_INCORRETA',
        message: 'Senha atual incorreta.',
        fields: { senhaAtual: 'Senha atual incorreta.' },
      },
    });
    expect(db.users[0]?.senhaHash).toBe(hashAntes);
    expect(db.sessions).toHaveLength(3);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('nova igual à atual → 400 AUTH_SENHA_IGUAL_ATUAL com fields.novaSenha, sem gravar (CA-53)', async () => {
    const { user } = await anaComTresSessoes();

    const erro = await errorOf(
      service.trocarSenha(user, { senhaAtual: ANA.senha, novaSenha: ANA.senha }),
    );

    expect(erro).toMatchObject({
      status: 400,
      body: { code: 'AUTH_SENHA_IGUAL_ATUAL', fields: { novaSenha: expect.any(String) } },
    });
    expect(db.sessions).toHaveLength(3);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('a regra "igual à atual" só é checada DEPOIS de a atual conferir (não denuncia a senha)', async () => {
    const { user } = await anaComTresSessoes();

    // Atual errada e nova igual à informada: a resposta é a da senha atual, não a da igualdade.
    const erro = await errorOf(
      service.trocarSenha(user, { senhaAtual: 'chute-errado', novaSenha: 'chute-errado' }),
    );

    expect(erro.body).toMatchObject({ code: 'AUTH_SENHA_ATUAL_INCORRETA' });
  });

  it('usuário que não existe mais → 401 AUTH_SESSAO_ENCERRADA', async () => {
    await expect(
      errorOf(
        service.trocarSenha(
          { id: 'id-que-nao-existe', sessionId: 'x' },
          { senhaAtual: 'a', novaSenha: 'outra-senha-boa' },
        ),
      ),
    ).resolves.toMatchObject({ status: 401, body: { code: 'AUTH_SESSAO_ENCERRADA' } });
  });
});

describe('sessões ativas (perfil CA-08 a CA-11)', () => {
  /**
   * Ana com três sessões, criadas em momentos diferentes (A, B, C, nesta ordem), e Bia com uma. O
   * `ultimoUsoEm` de cada uma é o momento do login.
   */
  async function cenario() {
    at(0);
    const a = await sessaoDe(ANA, CURL);
    const [sA] = db.sessions.map((s) => s.id);
    at(60_000);
    await service.login(
      { email: ANA.email, senha: ANA.senha },
      'Mozilla/5.0 (Linux; Android 14) Chrome/128.0 Mobile Safari/537.36',
    );
    at(120_000);
    await service.login({ email: ANA.email, senha: ANA.senha }, CURL);
    const [, sB, sC] = db.sessions.map((s) => s.id);
    at(180_000);
    await sessaoDe({ nome: 'Bia', email: 'bia@exemplo.com', senha: 'segredo-da-bia' }, CURL);
    const sBia = db.sessions.find((s) => s.userId !== a.usuario.id)?.id as string;
    const ana = (sessionId: string) => ({ id: a.usuario.id, sessionId });
    return { ana, sA: sA as string, sB: sB as string, sC: sC as string, sBia };
  }

  it('lista só as da conta, a ATUAL primeiro e depois do uso mais recente ao mais antigo (CA-08)', async () => {
    const { ana, sA, sB, sC } = await cenario();

    const lista = await service.listarSessoes(ana(sA));

    expect(lista.map((s) => s.id)).toEqual([sA, sC, sB]);
    expect(lista.map((s) => s.atual)).toEqual([true, false, false]);
    expect(lista[2]?.dispositivo).toBe('Chrome · Android');
  });

  it('cada item tem EXATAMENTE id, dispositivo, criadoEm, ultimoUsoEm e atual, com datas ISO (CA-08)', async () => {
    const { ana, sA } = await cenario();

    const [primeira] = await service.listarSessoes(ana(sA));

    expect(Object.keys(primeira ?? {}).sort()).toEqual([
      'atual',
      'criadoEm',
      'dispositivo',
      'id',
      'ultimoUsoEm',
    ]);
    // O Prisma falso preenche `criadoEm` com o relógio real; o que importa aqui é o formato ISO.
    expect(primeira?.criadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(primeira?.ultimoUsoEm).toBe(new Date(NOW).toISOString());
    const [args] = db.refreshSession.findMany.mock.calls.at(-1) as [
      { select: Record<string, boolean> },
    ];
    expect(Object.keys(args.select).sort()).toEqual([
      'criadoEm',
      'dispositivo',
      'id',
      'ultimoUsoEm',
    ]);
  });

  it('sessão VENCIDA não aparece', async () => {
    const { ana, sA, sB } = await cenario();
    const vencida = db.sessions.find((s) => s.id === sB);
    if (vencida) vencida.expiraEm = new Date(NOW - 1);

    const lista = await service.listarSessoes(ana(sA));

    expect(lista.map((s) => s.id)).not.toContain(sB);
    expect(lista).toHaveLength(2);
  });

  it('encerrar OUTRA sessão apaga só ela (CA-09)', async () => {
    const { ana, sA, sB, sC, sBia } = await cenario();

    await service.encerrarSessao(ana(sA), sB);

    expect(db.sessions.map((s) => s.id).sort()).toEqual([sA, sC, sBia].sort());
  });

  it('encerrar a PRÓPRIA sessão → 400 SESSAO_ATUAL, nada apagado (CA-10)', async () => {
    const { ana, sA } = await cenario();

    await expect(errorOf(service.encerrarSessao(ana(sA), sA))).resolves.toMatchObject({
      status: 400,
      body: { code: 'SESSAO_ATUAL' },
    });
    expect(db.sessions).toHaveLength(4);
  });

  it('sessão de OUTRO usuário e id inexistente → o MESMO 404 SESSAO_NAO_ENCONTRADA; a da Bia continua (CA-10)', async () => {
    const { ana, sA, sBia } = await cenario();

    const alheia = await errorOf(service.encerrarSessao(ana(sA), sBia));
    const inexistente = await errorOf(
      service.encerrarSessao(ana(sA), '00000000-0000-4000-8000-000000000000'),
    );

    expect(alheia).toEqual(inexistente);
    expect(alheia).toMatchObject({ status: 404, body: { code: 'SESSAO_NAO_ENCONTRADA' } });
    expect(db.sessions.map((s) => s.id)).toContain(sBia);
  });

  it('encerrar todas as OUTRAS: devolve a contagem e só a atual fica; repetir dá 0 (CA-11)', async () => {
    const { ana, sA, sBia } = await cenario();

    await expect(service.encerrarOutrasSessoes(ana(sA))).resolves.toEqual({ encerradas: 2 });
    expect(db.sessions.map((s) => s.id).sort()).toEqual([sA, sBia].sort());
    await expect(service.encerrarOutrasSessoes(ana(sA))).resolves.toEqual({ encerradas: 0 });
  });

  it('encerrar todas as outras não conta as vencidas (a contagem é a da lista)', async () => {
    const { ana, sA, sB } = await cenario();
    const vencida = db.sessions.find((s) => s.id === sB);
    if (vencida) vencida.expiraEm = new Date(NOW - 1);

    await expect(service.encerrarOutrasSessoes(ana(sA))).resolves.toEqual({ encerradas: 1 });
  });
});
