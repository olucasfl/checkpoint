import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(__dirname, '__fixtures__');
const files = readdirSync(DIR).filter((name) => name.endsWith('.json'));

// Os fixtures vêm de chamadas reais à Steam, sanitizadas (RULES.md §8): SteamID, nome de exibição e
// avatar são sintéticos. Este teste falha se uma recaptura deixar um dado real passar (CA-63).
describe('fixtures da Steam (CA-63)', () => {
  it('existem os fixtures das respostas reais que já foram capturadas', () => {
    expect(files).toEqual(
      expect.arrayContaining([
        'player-summaries.publico.json',
        'owned-games.publico.json',
        'player-achievements.com-conquistas.json',
        'player-achievements.sem-conquistas.json',
        'player-achievements.oculta.json',
        'schema.com-conquistas.json',
        'schema.sem-conquistas.json',
        'schema.oculta.json',
        'global-percentages.com-conquistas.json',
        'erro-401.chave-invalida.json',
      ]),
    );
  });

  it.each(files)('%s não contém SteamID real (17 dígitos começando com 7656)', (file) => {
    expect(readFileSync(join(DIR, file), 'utf8')).not.toMatch(/7656\d{13}/);
  });

  it.each(files)('%s tem o formato { status, body }', (file) => {
    const parsed = JSON.parse(readFileSync(join(DIR, file), 'utf8')) as Record<string, unknown>;

    expect(typeof parsed.status).toBe('number');
    expect(parsed).toHaveProperty('body');
  });

  it('o perfil usa nome, ID e avatar sintéticos', () => {
    const raw = readFileSync(join(DIR, 'player-summaries.publico.json'), 'utf8');
    const player = (
      JSON.parse(raw) as { body: { response: { players: Record<string, string>[] } } }
    ).body.response.players[0];

    expect(player).toMatchObject({
      steamid: 'STEAMID_SINTETICO',
      personaname: 'Jogador Sintetico',
    });
    expect(player?.avatarfull).toMatch(/^https:\/\/avatars\.steamstatic\.com\/0+_full\.jpg$/);
  });

  it('nenhum fixture contém a chave da Steam (32 hexadecimais depois de key=)', () => {
    for (const file of files) {
      expect(readFileSync(join(DIR, file), 'utf8')).not.toMatch(/key=[0-9a-f]{32}/i);
    }
  });
});
