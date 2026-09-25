import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A exclusão de conta (`POST /api/users/me/exclusao`) depende do `ON DELETE CASCADE` do banco: apagar o `User` leva
 * junto a `ContaVinculada` e o `JogoPlataforma` (spec `integracao-plataformas`, CA-56), e apagar um `Game` leva a
 * camada da plataforma dele. Este teste trava a migration e o schema; a conferência no banco real é manual.
 * Nenhuma chamada à Steam faz parte desse fluxo: o `UsersService` nem conhece a integração (teste abaixo).
 */
const RAIZ_DA_API = join(__dirname, '..', '..');
const MIGRATIONS = join(RAIZ_DA_API, 'prisma', 'migrations');

function migrationDaIntegracao(): string {
  const pasta = readdirSync(MIGRATIONS).find((nome) => nome.endsWith('_integracao_plataformas'));
  if (!pasta) {
    throw new Error('migration integracao_plataformas não encontrada');
  }
  return readFileSync(join(MIGRATIONS, pasta, 'migration.sql'), 'utf8');
}

describe('cascade da camada das plataformas (CA-56)', () => {
  it('a migration cria as três chaves estrangeiras com ON DELETE CASCADE', () => {
    const sql = migrationDaIntegracao();

    for (const restricao of [
      'ContaVinculada_userId_fkey',
      'JogoPlataforma_userId_fkey',
      'JogoPlataforma_gameId_fkey',
    ]) {
      const linha = sql.split('\n').find((texto) => texto.includes(`CONSTRAINT "${restricao}"`));
      expect(linha).toBeDefined();
      expect(linha).toContain('ON DELETE CASCADE');
    }
  });

  it('o schema.prisma declara onDelete: Cascade nas mesmas relações', () => {
    const schema = readFileSync(join(RAIZ_DA_API, 'prisma', 'schema.prisma'), 'utf8');
    const modelo = (nome: string) => {
      const achou = new RegExp(`model ${nome} \\{[\\s\\S]*?\\n\\}`).exec(schema);
      expect(achou).not.toBeNull();
      return achou?.[0] ?? '';
    };

    expect(modelo('ContaVinculada')).toMatch(/user\s+User\s+@relation\([^)]*onDelete: Cascade/);
    const jogo = modelo('JogoPlataforma');
    expect(jogo).toMatch(/user\s+User\s+@relation\([^)]*onDelete: Cascade/);
    expect(jogo).toMatch(/game\s+Game\s+@relation\([^)]*onDelete: Cascade/);
  });
});

describe('a exclusão de conta não fala com a Steam', () => {
  const fonte = (relativo: string) => readFileSync(join(__dirname, '..', relativo), 'utf8');
  const INTEGRACAO =
    /SteamClient|SteamProvider|ProviderRegistry|IntegrationsService|GAME_PROVIDERS|integrations\/(steam|providers)/;

  it.each([
    'modules/users/users.service.ts',
    'modules/users/users.controller.ts',
    'modules/games/games.service.ts',
  ])('%s não importa nada que chame a plataforma', (arquivo) => {
    expect(fonte(arquivo)).not.toMatch(INTEGRACAO);
  });

  it('o módulo de usuários não depende do módulo de integrações', () => {
    expect(fonte('modules/users/users.module.ts')).not.toMatch(/IntegrationsModule|integrations\//);
  });
});
