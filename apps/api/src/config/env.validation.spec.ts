import 'reflect-metadata';
import { validateEnv } from './env.validation';

// Valores sintéticos e óbvios (RULES.md §8): nenhum segredo real em teste.
const valid = {
  DATABASE_URL: 'postgresql://usuario:senha@localhost:5432/teste',
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_CHAVE_SINTETICA_DE_TESTE',
  SUPABASE_STORAGE_BUCKET: 'capas',
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
