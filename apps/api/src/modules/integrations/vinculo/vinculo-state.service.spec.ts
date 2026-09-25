import { type ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthTokensService } from '../../auth/auth-tokens.service';
import { TOKEN_ISSUER } from '../../auth/auth.constants';
import { VINCULO_STATE_ISSUER, VINCULO_STATE_TTL_SECONDS } from '../integrations.constants';
import {
  VinculoExpiradoError,
  VinculoInvalidoError,
  VinculoStateService,
} from './vinculo-state.service';

// Valores sintéticos e óbvios (RULES.md §8).
const ACCESS_SECRET = 'segredo-de-acesso-sintetico-com-mais-de-32-caracteres';
const REFRESH_SECRET = 'segredo-de-refresh-sintetico-com-mais-de-32-caracteres';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const SESSION_ID = '22222222-2222-4222-8222-222222222222';
const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);

const config = {
  get: (key: string) =>
    ({ JWT_ACCESS_SECRET: ACCESS_SECRET, JWT_REFRESH_SECRET: REFRESH_SECRET })[key],
} as unknown as ConfigService<never, true>;

const jwt = new JwtService({});
const service = new VinculoStateService(jwt, config as never);
const tokens = new AuthTokensService(jwt, config as never);

/** Um token com as claims e o emissor que o teste quiser, assinado com o segredo do access token. */
function assinar(
  claims: Record<string, unknown>,
  options: { issuer?: string; secret?: string } = {},
): Promise<string> {
  return jwt.signAsync(claims, {
    secret: options.secret ?? ACCESS_SECRET,
    issuer: options.issuer ?? VINCULO_STATE_ISSUER,
    expiresIn: 600,
    algorithm: 'HS256',
  });
}

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('VinculoStateService.emitir / verificar', () => {
  it('o state emitido volta o usuário e o nonce, e vale 10 minutos', async () => {
    const { state, nonce } = await service.emitir(USER_ID, 'STEAM');

    await expect(service.verificar(state, 'STEAM')).resolves.toEqual({ userId: USER_ID, nonce });
    const claims = jwt.decode<{ iat: number; exp: number; iss: string; typ: string; prov: string }>(
      state,
    );
    expect(claims.exp - claims.iat).toBe(VINCULO_STATE_TTL_SECONDS);
    expect(claims.iss).toBe(VINCULO_STATE_ISSUER);
    expect(claims).toMatchObject({ typ: 'vinculo', prov: 'STEAM' });
  });

  it('cada state tem um nonce novo, com entropia suficiente (256 bits)', async () => {
    const a = await service.emitir(USER_ID, 'STEAM');
    const b = await service.emitir(USER_ID, 'STEAM');

    expect(a.nonce).not.toBe(b.nonce);
    expect(Buffer.from(a.nonce, 'base64url')).toHaveLength(32);
  });

  it('o state não carrega e-mail, nome nem SteamID: só o id do usuário, o provedor e o nonce', async () => {
    const { state } = await service.emitir(USER_ID, 'STEAM');
    const claims = jwt.decode<Record<string, unknown>>(state);

    expect(Object.keys(claims).sort()).toEqual([
      'exp',
      'iat',
      'iss',
      'nonce',
      'prov',
      'sub',
      'typ',
    ]);
  });

  it('state adulterado (assinatura) → VinculoInvalidoError (CA-10)', async () => {
    const { state } = await service.emitir(USER_ID, 'STEAM');
    const adulterado = `${state.slice(0, -4)}${state.endsWith('AAAA') ? 'BBBB' : 'AAAA'}`;

    await expect(service.verificar(adulterado, 'STEAM')).rejects.toBeInstanceOf(
      VinculoInvalidoError,
    );
  });

  it.each(['', 'lixo', 'a.b.c', 'eyJhbGciOiJub25lIn0.e30.'])(
    'state ilegível %j → VinculoInvalidoError (inclusive alg none)',
    async (state) => {
      await expect(service.verificar(state, 'STEAM')).rejects.toBeInstanceOf(VinculoInvalidoError);
    },
  );

  it('state vencido (mais de 10 min) → VinculoExpiradoError, mas só se a assinatura conferir (CA-10)', async () => {
    const { state } = await service.emitir(USER_ID, 'STEAM');
    jest.spyOn(Date, 'now').mockReturnValue(NOW + (VINCULO_STATE_TTL_SECONDS + 1) * 1000);

    await expect(service.verificar(state, 'STEAM')).rejects.toBeInstanceOf(VinculoExpiradoError);
  });

  it('state vencido E adulterado é inválido, não "expirado" (não revela que a assinatura era boa)', async () => {
    const { state } = await service.emitir(USER_ID, 'STEAM');
    const adulterado = `${state.slice(0, -4)}${state.endsWith('AAAA') ? 'BBBB' : 'AAAA'}`;
    jest.spyOn(Date, 'now').mockReturnValue(NOW + 3_600_000);

    await expect(service.verificar(adulterado, 'STEAM')).rejects.toBeInstanceOf(
      VinculoInvalidoError,
    );
  });

  it('state de outro provedor → VinculoInvalidoError', async () => {
    const state = await assinar({
      sub: USER_ID,
      typ: 'vinculo',
      prov: 'XBOX',
      nonce: 'n'.repeat(43),
    });

    await expect(service.verificar(state, 'STEAM')).rejects.toBeInstanceOf(VinculoInvalidoError);
  });

  it.each([
    ['sem sub', { typ: 'vinculo', prov: 'STEAM', nonce: 'n'.repeat(43) }],
    ['sub vazio', { sub: '', typ: 'vinculo', prov: 'STEAM', nonce: 'n'.repeat(43) }],
    ['sem nonce', { sub: USER_ID, typ: 'vinculo', prov: 'STEAM' }],
    ['nonce vazio', { sub: USER_ID, typ: 'vinculo', prov: 'STEAM', nonce: '' }],
    ['typ diferente', { sub: USER_ID, typ: 'outro', prov: 'STEAM', nonce: 'n'.repeat(43) }],
  ])('claims incompletas (%s) → VinculoInvalidoError', async (_nome, claims) => {
    await expect(service.verificar(await assinar(claims), 'STEAM')).rejects.toBeInstanceOf(
      VinculoInvalidoError,
    );
  });

  it('state assinado com OUTRO segredo → VinculoInvalidoError', async () => {
    const state = await assinar(
      { sub: USER_ID, typ: 'vinculo', prov: 'STEAM', nonce: 'n'.repeat(43) },
      { secret: 'outro-segredo-sintetico-com-mais-de-32-caracteres' },
    );

    await expect(service.verificar(state, 'STEAM')).rejects.toBeInstanceOf(VinculoInvalidoError);
  });
});

describe('o fluxo recusa token de outro tipo como state (CA-62)', () => {
  it('um ACCESS TOKEN válido (mesmo segredo, emissor dos tokens de acesso) não vale como state', async () => {
    const access = await tokens.signAccess(USER_ID, SESSION_ID);

    await expect(service.verificar(access, 'STEAM')).rejects.toBeInstanceOf(VinculoInvalidoError);
  });

  it('mesmo com o emissor do state, um token com typ "access" cai no typ (a segunda barreira)', async () => {
    const forjado = await assinar({ sub: USER_ID, sid: SESSION_ID, typ: 'access' });

    await expect(service.verificar(forjado, 'STEAM')).rejects.toBeInstanceOf(VinculoInvalidoError);
  });

  it('um REFRESH TOKEN válido (assinado com o outro segredo) não vale como state', async () => {
    const refresh = await tokens.signRefresh(USER_ID, SESSION_ID);

    await expect(service.verificar(refresh, 'STEAM')).rejects.toBeInstanceOf(VinculoInvalidoError);
  });
});

describe('o emissor separa o state do access token (base do CA-61)', () => {
  it('o state não usa o emissor dos tokens de acesso', async () => {
    const { state } = await service.emitir(USER_ID, 'STEAM');

    expect(jwt.decode<{ iss: string }>(state).iss).not.toBe(TOKEN_ISSUER);
    // E o serviço dos tokens de acesso o recusa já na verificação do emissor.
    await expect(tokens.verifyAccess(state)).rejects.toThrow();
  });
});

describe('VinculoStateService.nonceConfere', () => {
  it('nonces iguais conferem', () => {
    expect(VinculoStateService.nonceConfere('abc123', 'abc123')).toBe(true);
  });

  it.each([
    ['diferentes', 'abc123', 'abc124'],
    ['tamanhos diferentes', 'abc', 'abc123'],
    ['só a caixa muda', 'ABC123', 'abc123'],
  ])('nonces %s não conferem (CA-09)', (_nome, doCookie, doState) => {
    expect(VinculoStateService.nonceConfere(doCookie, doState)).toBe(false);
  });

  it.each([undefined, ''])('sem cookie (%j) não confere (CA-09)', (doCookie) => {
    expect(VinculoStateService.nonceConfere(doCookie, 'abc123')).toBe(false);
  });

  it('nonce vazio no state não confere nem com cookie vazio', () => {
    expect(VinculoStateService.nonceConfere('', '')).toBe(false);
  });
});
