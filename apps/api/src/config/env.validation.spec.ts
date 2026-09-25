import 'reflect-metadata';
import { DEFAULT_REGISTRATION_LIMIT_PER_HOUR, validateEnv } from './env.validation';

// Valores sintéticos e óbvios (RULES.md §8): nenhum segredo real em teste.
const valid = {
  DATABASE_URL: 'postgresql://usuario:senha@localhost:5432/teste',
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_CHAVE_SINTETICA_DE_TESTE',
  SUPABASE_STORAGE_BUCKET: 'capas',
  CORS_ORIGIN: 'http://localhost:5173',
  JWT_ACCESS_SECRET: 'segredo-de-acesso-sintetico-com-mais-de-32-caracteres',
  JWT_REFRESH_SECRET: 'segredo-de-refresh-sintetico-com-mais-de-32-caracteres',
  AUTH_REGISTRATION_OPEN: 'true',
  // 32 hexadecimais óbvios, nunca a chave real da Steam.
  STEAM_API_KEY: '0123456789ABCDEF0123456789ABCDEF',
  API_PUBLIC_URL: 'http://localhost:3333',
  WEB_PUBLIC_URL: 'http://localhost:5173',
};

function messageOf(env: Record<string, unknown>): string {
  try {
    validateEnv(env);
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error('esperava que a validação do ambiente falhasse');
}

describe('validateEnv — Supabase Storage', () => {
  it('aceita as três variáveis com uma secret key nova (CA-90)', () => {
    expect(validateEnv(valid)).toMatchObject({
      SUPABASE_URL: valid.SUPABASE_URL,
      SUPABASE_STORAGE_BUCKET: 'capas',
    });
  });

  it('aceita a service_role legada (JWT)', () => {
    const legacy = {
      ...valid,
      SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiJ9.SINTETICO.SINTETICO',
    };

    expect(() => validateEnv(legacy)).not.toThrow();
  });

  it.each(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_STORAGE_BUCKET'])(
    'falha listando %s quando ela está ausente (CA-68)',
    (name) => {
      const { [name]: _removida, ...env } = valid as Record<string, string>;

      expect(messageOf(env)).toContain(name);
    },
  );

  it.each(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_STORAGE_BUCKET'])(
    'falha quando %s está vazia (CA-68)',
    (name) => {
      expect(messageOf({ ...valid, [name]: '' })).toContain(name);
    },
  );

  it('rejeita SUPABASE_URL que não é uma URL', () => {
    expect(messageOf({ ...valid, SUPABASE_URL: 'nao-e-uma-url' })).toContain('SUPABASE_URL');
  });

  it('recusa a chave publishable com a mensagem orientando a secret key (CA-90)', () => {
    const message = messageOf({
      ...valid,
      SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_CHAVE_SINTETICA',
    });

    expect(message).toContain(
      'SUPABASE_SERVICE_ROLE_KEY parece a chave publishable; use a secret key (sb_secret_…) ou a service_role legada',
    );
  });

  it('não ecoa o valor da chave na mensagem de erro (RULES.md §8)', () => {
    const message = messageOf({
      ...valid,
      SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_CHAVE_SINTETICA',
    });

    expect(message).not.toContain('CHAVE_SINTETICA');
  });
});

describe('validateEnv — autenticação (CA-18)', () => {
  it('aceita a configuração válida e lê AUTH_REGISTRATION_OPEN como booleano', () => {
    expect(validateEnv(valid)).toMatchObject({ AUTH_REGISTRATION_OPEN: true });
    expect(validateEnv({ ...valid, AUTH_REGISTRATION_OPEN: 'false' })).toMatchObject({
      AUTH_REGISTRATION_OPEN: false,
    });
  });

  it.each(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'AUTH_REGISTRATION_OPEN', 'CORS_ORIGIN'])(
    'falha listando %s quando ela está ausente',
    (name) => {
      const { [name]: _removida, ...env } = valid as Record<string, string>;

      expect(messageOf(env)).toContain(name);
    },
  );

  it.each(['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'])(
    'falha quando %s tem menos de 32 caracteres',
    (name) => {
      expect(messageOf({ ...valid, [name]: 'x'.repeat(31) })).toContain(name);
      expect(() => validateEnv({ ...valid, [name]: 'x'.repeat(32) + name })).not.toThrow();
    },
  );

  it('falha quando os dois segredos são iguais', () => {
    const iguais = { ...valid, JWT_REFRESH_SECRET: valid.JWT_ACCESS_SECRET };

    expect(messageOf(iguais)).toContain(
      'JWT_REFRESH_SECRET: deve ser diferente de JWT_ACCESS_SECRET',
    );
  });

  it.each(['talvez', '', '1', 'TRUE'])(
    'AUTH_REGISTRATION_OPEN=%j não é true nem false e falha (nunca vira "true" por conversão)',
    (value) => {
      expect(messageOf({ ...valid, AUTH_REGISTRATION_OPEN: value })).toContain(
        'AUTH_REGISTRATION_OPEN',
      );
    },
  );

  it.each(['*', 'http://localhost:5173,*', ' * '])(
    'CORS_ORIGIN=%j é recusada com a mensagem orientando a listar as origens',
    (value) => {
      expect(messageOf({ ...valid, CORS_ORIGIN: value })).toContain(
        'CORS_ORIGIN não pode ser * com cookies de sessão; liste as origens, ex.: http://localhost:5173',
      );
    },
  );

  it('aceita uma lista de origens', () => {
    expect(() =>
      validateEnv({ ...valid, CORS_ORIGIN: 'http://localhost:5173,https://app.exemplo.com' }),
    ).not.toThrow();
  });

  it('a mensagem de erro NUNCA ecoa o valor de um segredo', () => {
    const message = messageOf({ ...valid, JWT_ACCESS_SECRET: 'CURTO-SINTETICO' });

    expect(message).toContain('JWT_ACCESS_SECRET');
    expect(message).not.toContain('CURTO-SINTETICO');
  });
});

describe('validateEnv — integração com plataformas (CA-02)', () => {
  const NAMES = ['STEAM_API_KEY', 'API_PUBLIC_URL', 'WEB_PUBLIC_URL'];

  it('aceita a configuração válida (chave com maiúsculas ou minúsculas; origem de produção)', () => {
    expect(validateEnv(valid)).toMatchObject({ STEAM_API_KEY: valid.STEAM_API_KEY });
    expect(() =>
      validateEnv({
        ...valid,
        STEAM_API_KEY: 'abcdefabcdefabcdefabcdefabcdefab',
        API_PUBLIC_URL: 'https://checkpoint.exemplo.vercel.app',
        WEB_PUBLIC_URL: 'https://checkpoint.exemplo.vercel.app',
      }),
    ).not.toThrow();
  });

  it.each(NAMES)('falha listando %s quando ela está ausente', (name) => {
    const { [name]: _removida, ...env } = valid as Record<string, string>;

    expect(messageOf(env)).toContain(name);
  });

  it.each(NAMES)('falha quando %s está vazia', (name) => {
    expect(messageOf({ ...valid, [name]: '' })).toContain(name);
  });

  it.each([
    'abc',
    '0123456789ABCDEF0123456789ABCDE',
    '0123456789ABCDEF0123456789ABCDEFF',
    'G'.repeat(32),
  ])('STEAM_API_KEY=%j (fora de 32 hexadecimais) falha', (value) => {
    expect(messageOf({ ...valid, STEAM_API_KEY: value })).toContain('STEAM_API_KEY');
  });

  it.each([
    'http://localhost:3333/',
    'localhost:3333',
    'ftp://localhost',
    'http://localhost/api',
    'http://a b',
  ])('API_PUBLIC_URL=%j (não é uma origem http(s) sem barra final) falha', (value) => {
    expect(messageOf({ ...valid, API_PUBLIC_URL: value })).toContain('API_PUBLIC_URL');
    expect(messageOf({ ...valid, WEB_PUBLIC_URL: value })).toContain('WEB_PUBLIC_URL');
  });

  it('a mensagem de erro NUNCA ecoa o valor da chave da Steam', () => {
    const message = messageOf({ ...valid, STEAM_API_KEY: 'CHAVE-STEAM-SINTETICA-INVALIDA' });

    expect(message).toContain('STEAM_API_KEY');
    expect(message).not.toContain('CHAVE-STEAM-SINTETICA-INVALIDA');
  });

  it('a validação bem-sucedida não escreve o valor da chave em nenhum log de boot', () => {
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((method) =>
      jest.spyOn(console, method).mockImplementation(() => undefined),
    );

    validateEnv(valid);

    const printed = spies.flatMap((spy) => spy.mock.calls.flat().map(String)).join('\n');
    spies.forEach((spy) => spy.mockRestore());
    expect(printed).not.toContain(valid.STEAM_API_KEY);
  });
});

describe('validateEnv — AUTH_REGISTRATION_LIMIT_PER_HOUR (opcional)', () => {
  it('ausente é válida (o padrão vive no código: 3 por hora)', () => {
    expect(validateEnv(valid).AUTH_REGISTRATION_LIMIT_PER_HOUR).toBeUndefined();
    expect(DEFAULT_REGISTRATION_LIMIT_PER_HOUR).toBe(3);
  });

  it('aceita um inteiro maior ou igual a 1', () => {
    expect(validateEnv({ ...valid, AUTH_REGISTRATION_LIMIT_PER_HOUR: '2' })).toMatchObject({
      AUTH_REGISTRATION_LIMIT_PER_HOUR: 2,
    });
  });

  it.each(['0', '-1', '1.5', 'abc'])('%j falha no boot', (value) => {
    expect(messageOf({ ...valid, AUTH_REGISTRATION_LIMIT_PER_HOUR: value })).toContain(
      'AUTH_REGISTRATION_LIMIT_PER_HOUR',
    );
  });
});
