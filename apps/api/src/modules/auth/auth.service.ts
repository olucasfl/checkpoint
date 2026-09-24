import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  normalizeEmail,
  type LoginRequest,
  type RegistroRequest,
  type TrocarSenhaRequest,
  type Usuario,
} from '@checkpoint/shared';
import { type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../database/prisma.service';
import { type EnvironmentVariables } from '../../config/env.validation';
import { authErrors } from './auth-errors';
import { AuthTokensService, type TokenClaims } from './auth-tokens.service';
import {
  MAX_SESSIONS_PER_USER,
  REFRESH_GRACE_WINDOW_MS,
  REFRESH_TOKEN_TTL_SECONDS,
} from './auth.constants';
import { PasswordHasher } from './password-hasher';
import { deviceLabel } from './session-device';

/**
 * Lista branca do que sai do banco sobre o usuário: NUNCA o registro inteiro, para `senhaHash` não
 * poder vazar por um `select` esquecido.
 */
export const USUARIO_PUBLICO_SELECT = {
  id: true,
  nome: true,
  email: true,
  criadoEm: true,
} as const satisfies Prisma.UserSelect;

type UsuarioRow = Prisma.UserGetPayload<{ select: typeof USUARIO_PUBLICO_SELECT }>;

/** O que o controller recebe: o refresh token vai para o cookie, nunca para o corpo. */
export interface SessionResult {
  accessToken: string;
  refreshToken: string;
  usuario: Usuario;
}

function toUsuario(row: UsuarioRow): Usuario {
  return { id: row.id, nome: row.nome, email: row.email, criadoEm: row.criadoEm.toISOString() };
}

/** SHA-256 e não bcrypt: o token já tem alta entropia, e o bcrypt truncaria em 72 bytes. */
function sha256(texto: string): string {
  return createHash('sha256').update(texto).digest('hex');
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private dummyHashPromise?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: AuthTokensService,
    private readonly hasher: PasswordHasher,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  /** Aquece o hash fixo: a primeira tentativa com e-mail inexistente não pode ser a mais lenta. */
  async onModuleInit(): Promise<void> {
    await this.dummyHash();
  }

  async register(dto: RegistroRequest, userAgent?: string): Promise<SessionResult> {
    // Antes de qualquer consulta: com o registro fechado, nem a existência do e-mail é revelada.
    if (!this.config.get('AUTH_REGISTRATION_OPEN', { infer: true })) {
      throw authErrors.registroFechado();
    }

    const email = normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      throw authErrors.emailEmUso();
    }

    const senhaHash = await this.hasher.hash(dto.senha);
    let user: UsuarioRow;
    try {
      user = await this.prisma.user.create({
        data: { nome: dto.nome.trim(), email, senhaHash },
        select: USUARIO_PUBLICO_SELECT,
      });
    } catch (error) {
      // Duas requests com o mesmo e-mail passam juntas pela checagem acima: quem perde a corrida no
      // `@unique` recebe o mesmo 409, nunca um 500.
      if (isUniqueViolation(error)) {
        throw authErrors.emailEmUso();
      }
      throw error;
    }

    return this.openSession(user, userAgent);
  }

  async login(dto: LoginRequest, userAgent?: string): Promise<SessionResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: normalizeEmail(dto.email) },
      select: { ...USUARIO_PUBLICO_SELECT, senhaHash: true },
    });

    // E-mail inexistente também paga o custo de um hash: o tempo de resposta não denuncia se a conta existe.
    const valid = await this.hasher.verify(user?.senhaHash ?? (await this.dummyHash()), dto.senha);
    if (!user || !valid) {
      throw authErrors.credenciaisInvalidas();
    }

    return this.openSession(user, userAgent);
  }

  /**
   * Renova a sessão com rotação, na MESMA linha (não cria sessão nova). O token anterior vale por 30 s
   * (corrida legítima de abas); fora disso, apresentá-lo é reuso e encerra a sessão.
   */
  async refresh(refreshToken: string | undefined): Promise<SessionResult> {
    if (!refreshToken) {
      throw authErrors.sessaoEncerrada();
    }

    const claims = await this.verifyRefreshClaims(refreshToken);
    const session = await this.prisma.refreshSession.findUnique({ where: { id: claims.sid } });
    const now = Date.now();
    if (!session || session.userId !== claims.sub || session.expiraEm.getTime() <= now) {
      throw authErrors.sessaoEncerrada();
    }

    const presented = sha256(refreshToken);

    if (presented !== session.tokenHash) {
      const inGraceWindow =
        presented === session.hashAnterior &&
        session.rotacionadoEm !== null &&
        now - session.rotacionadoEm.getTime() <= REFRESH_GRACE_WINDOW_MS;
      if (inGraceWindow) {
        throw authErrors.refreshConcorrente();
      }
      // Um token que já foi trocado (ou que não bate com nenhum dos dois) só existe se vazou: a
      // sessão inteira cai, e o legítimo dono e o portador do token vazado têm de entrar de novo.
      await this.prisma.refreshSession.deleteMany({ where: { id: session.id } });
      this.logger.warn(`Refresh token reutilizado: sessão ${session.id} encerrada`);
      throw authErrors.sessaoEncerrada();
    }

    const nextRefresh = await this.tokens.signRefresh(claims.sub, session.id);
    const rotated = await this.prisma.refreshSession.updateMany({
      // O `tokenHash` na condição: se outra request rotacionou no meio, o `count` é 0 e a resposta é a
      // da corrida, não uma segunda rotação.
      where: { id: session.id, tokenHash: presented },
      data: {
        hashAnterior: presented,
        tokenHash: sha256(nextRefresh),
        rotacionadoEm: new Date(now),
        ultimoUsoEm: new Date(now),
        expiraEm: new Date(now + REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    });
    if (rotated.count === 0) {
      throw authErrors.refreshConcorrente();
    }

    const user = await this.prisma.user.findUnique({
      where: { id: claims.sub },
      select: USUARIO_PUBLICO_SELECT,
    });
    if (!user) {
      throw authErrors.sessaoEncerrada();
    }

    return {
      accessToken: await this.tokens.signAccess(claims.sub, session.id),
      refreshToken: nextRefresh,
      usuario: toUsuario(user),
    };
  }

  /** Idempotente: encerra a sessão que o cookie identifica, se houver; qualquer outro caso é um no-op. */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) {
      return;
    }
    let claims: TokenClaims;
    try {
      // Sair com o cookie já vencido também deve funcionar.
      claims = await this.tokens.verifyRefresh(refreshToken, { ignoreExpiration: true });
    } catch {
      return;
    }
    if (claims.typ !== 'refresh' || typeof claims.sid !== 'string') {
      return;
    }
    await this.prisma.refreshSession.deleteMany({
      where: { id: claims.sid, userId: claims.sub },
    });
  }

  async me(userId: string): Promise<Usuario> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USUARIO_PUBLICO_SELECT,
    });
    if (!user) {
      throw authErrors.sessaoEncerrada();
    }
    return toUsuario(user);
  }

  /**
   * Troca a senha de quem está logado. A regra "nova diferente da atual" só é checada depois de a atual
   * conferir: antes disso, a resposta denunciaria qual é a senha atual. Sucesso encerra TODAS as outras
   * sessões (quem trocou a senha por suspeita de vazamento derruba quem estiver usando a conta) e mantém
   * a deste dispositivo, na mesma transação que grava o hash novo.
   */
  async trocarSenha(user: AuthenticatedUser, dto: TrocarSenhaRequest): Promise<void> {
    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { senhaHash: true },
    });
    if (!row) {
      throw authErrors.sessaoEncerrada();
    }
    if (!(await this.hasher.verify(row.senhaHash, dto.senhaAtual))) {
      throw authErrors.senhaAtualIncorreta();
    }
    if (dto.novaSenha === dto.senhaAtual) {
      throw authErrors.senhaIgualAtual();
    }

    const senhaHash = await this.hasher.hash(dto.novaSenha);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { senhaHash },
        select: { id: true },
      }),
      this.prisma.refreshSession.deleteMany({
        where: { userId: user.id, id: { not: user.sessionId } },
      }),
    ]);
  }

  /** Cria a sessão deste dispositivo, limpa as vencidas e respeita o teto de sessões. */
  private async openSession(user: UsuarioRow, userAgent?: string): Promise<SessionResult> {
    // `Date.now()` (e não `new Date()`): o relógio dos testes é o `Date.now`.
    const now = new Date(Date.now());
    await this.prisma.refreshSession.deleteMany({
      where: { userId: user.id, expiraEm: { lt: now } },
    });

    const sessionId = randomUUID();
    const refreshToken = await this.tokens.signRefresh(user.id, sessionId);
    await this.prisma.refreshSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        tokenHash: sha256(refreshToken),
        dispositivo: deviceLabel(userAgent),
        ultimoUsoEm: now,
        expiraEm: new Date(now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    });
    await this.enforceSessionCap(user.id, sessionId);

    return {
      accessToken: await this.tokens.signAccess(user.id, sessionId),
      refreshToken,
      usuario: toUsuario(user),
    };
  }

  /** A 11ª sessão apaga a de `ultimoUsoEm` mais antigo (nunca a que acabou de nascer). */
  private async enforceSessionCap(userId: string, keepSessionId: string): Promise<void> {
    const sessions = await this.prisma.refreshSession.findMany({
      where: { userId },
      orderBy: { ultimoUsoEm: 'asc' },
      select: { id: true },
    });
    const excess = sessions.length - MAX_SESSIONS_PER_USER;
    if (excess <= 0) {
      return;
    }
    const oldest = sessions
      .filter((session) => session.id !== keepSessionId)
      .slice(0, excess)
      .map((session) => session.id);
    await this.prisma.refreshSession.deleteMany({ where: { id: { in: oldest } } });
  }

  private async verifyRefreshClaims(refreshToken: string): Promise<TokenClaims> {
    let claims: TokenClaims;
    try {
      claims = await this.tokens.verifyRefresh(refreshToken);
    } catch {
      throw authErrors.sessaoEncerrada();
    }
    if (
      claims.typ !== 'refresh' ||
      typeof claims.sub !== 'string' ||
      typeof claims.sid !== 'string'
    ) {
      throw authErrors.sessaoEncerrada();
    }
    return claims;
  }

  private dummyHash(): Promise<string> {
    this.dummyHashPromise ??= this.hasher.hash(randomBytes(16).toString('hex'));
    return this.dummyHashPromise;
  }
}
