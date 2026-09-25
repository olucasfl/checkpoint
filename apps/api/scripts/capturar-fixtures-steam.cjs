#!/usr/bin/env node
/**
 * Captura UMA VEZ as respostas reais da Steam Web API que ainda não têm fixture (spec `integracao-plataformas`,
 * CA-63), sanitiza e grava em `src/modules/integrations/steam/__fixtures__/`. Sem dependência: só `fetch` do Node.
 *
 * Uso (a partir da raiz do repositório):
 *
 *   node apps/api/scripts/capturar-fixtures-steam.cjs privado
 *   node apps/api/scripts/capturar-fixtures-steam.cjs detalhes-privados
 *   node apps/api/scripts/capturar-fixtures-steam.cjs vazio
 *
 * Antes de cada modo, deixe a conta de teste no estado certo NO SITE DA STEAM (e espere alguns minutos: a Web
 * API demora a refletir a privacidade):
 *   privado            "Meu perfil" = Privado                        (STEAM_TEST_ID_PUBLICO)
 *   detalhes-privados  "Meu perfil" = Público e "Detalhes do jogo" = Privado (STEAM_TEST_ID_PUBLICO)
 *   vazio              uma conta pública SEM jogos                   (STEAM_TEST_ID_VAZIO)
 *
 * Regras (gastam a cota da chave): UMA captura por execução, sem laço e sem nova tentativa. Se o estado NÃO for o
 * esperado, o script para SEM gravar nada e diz o que veio. Lê `STEAM_API_KEY` e os IDs de `apps/api/.env` sem
 * imprimi-los; SteamID, nome e avatar viram valores sintéticos, e o ID de teste nunca é gravado.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- script CommonJS sem build, roda direto no Node */
const fs = require('node:fs');
const path = require('node:path');

const RAIZ_DA_API = path.resolve(__dirname, '..');
const SAIDA = path.join(RAIZ_DA_API, 'src/modules/integrations/steam/__fixtures__');
const SINTETICO = 'STEAMID_SINTETICO';
// Appids da biblioteca da conta de teste: um COM conquistas e um SEM (fixtures `.com-` e `.sem-conquistas`).
const APP_COM_CONQUISTAS = 1794680;
const APP_SEM_CONQUISTAS = 2076040;

const MODOS = {
  privado: { idVar: 'STEAM_TEST_ID_PUBLICO' },
  'detalhes-privados': { idVar: 'STEAM_TEST_ID_PUBLICO' },
  vazio: { idVar: 'STEAM_TEST_ID_VAZIO' },
};

function lerEnv() {
  const texto = fs.readFileSync(path.join(RAIZ_DA_API, '.env'), 'utf8');
  return Object.fromEntries(
    texto
      .split(/\r?\n/)
      .filter((linha) => /^[A-Z_]+=/.test(linha))
      .map((linha) => [linha.slice(0, linha.indexOf('=')), linha.slice(linha.indexOf('=') + 1)]),
  );
}

async function chamar(chave, caminho, params) {
  const query = new URLSearchParams({ key: chave, format: 'json', ...params });
  const res = await fetch(`https://api.steampowered.com/${caminho}?${query}`, {
    signal: AbortSignal.timeout(15000),
  });
  const texto = await res.text();
  let body;
  try {
    body = JSON.parse(texto);
  } catch {
    body = { __texto: texto.slice(0, 300) };
  }
  return { status: res.status, tipo: res.headers.get('content-type'), body };
}

async function main() {
  const modo = process.argv[2];
  if (!MODOS[modo]) {
    console.error(`Modo inválido. Use: ${Object.keys(MODOS).join(' | ')}`);
    process.exit(2);
  }
  const env = lerEnv();
  const chave = env.STEAM_API_KEY;
  const id = env[MODOS[modo].idVar];
  if (!chave || !id) {
    console.error(`Faltam STEAM_API_KEY e/ou ${MODOS[modo].idVar} em apps/api/.env.`);
    process.exit(2);
  }

  const limpar = (valor) => {
    if (typeof valor === 'string')
      return valor
        .replace(/7656\d{13}/g, SINTETICO)
        .split(id)
        .join(SINTETICO);
    if (Array.isArray(valor)) return valor.map(limpar);
    if (valor && typeof valor === 'object') {
      return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, limpar(v)]));
    }
    return valor;
  };
  const gravar = (arquivo, resposta) =>
    fs.writeFileSync(
      path.join(SAIDA, arquivo),
      JSON.stringify(limpar({ status: resposta.status, body: resposta.body }), null, 2) + '\n',
    );
  const perfilSintetico = (jogador, visibilidade) => ({
    status: 200,
    body: {
      response: {
        players: [
          {
            steamid: SINTETICO,
            communityvisibilitystate: visibilidade,
            profilestate: jogador.profilestate,
            personaname: 'Jogador Sintetico',
            profileurl: `https://steamcommunity.com/profiles/${SINTETICO}/`,
            avatar: 'https://avatars.steamstatic.com/0000000000000000000000000000000000000000.jpg',
            avatarmedium:
              'https://avatars.steamstatic.com/0000000000000000000000000000000000000000_medium.jpg',
            avatarfull:
              'https://avatars.steamstatic.com/0000000000000000000000000000000000000000_full.jpg',
            personastate: jogador.personastate,
          },
        ],
      },
    },
  });

  fs.mkdirSync(SAIDA, { recursive: true });
  const resumo = await chamar(chave, 'ISteamUser/GetPlayerSummaries/v2/', { steamids: id });
  const jogador = resumo.body?.response?.players?.[0] ?? {};
  const visibilidade = jogador.communityvisibilitystate;
  console.log(
    `GetPlayerSummaries: HTTP ${resumo.status} | communityvisibilitystate = ${visibilidade}`,
  );

  const biblioteca = await chamar(chave, 'IPlayerService/GetOwnedGames/v1/', {
    steamid: id,
    include_appinfo: 1,
    include_played_free_games: 1,
  });
  const chaves = Object.keys(biblioteca.body?.response ?? {}).join(',') || '(vazio)';
  console.log(`GetOwnedGames: HTTP ${biblioteca.status} | chaves da resposta = ${chaves}`);

  if (modo === 'privado') {
    if (visibilidade === 3) {
      console.log(
        'Ainda PÚBLICO (veio 3). Nada foi gravado. Confira a privacidade e espere alguns minutos.',
      );
      return;
    }
    const filtrada = await chamar(chave, 'IPlayerService/GetOwnedGames/v1/', {
      input_json: JSON.stringify({
        steamid: id,
        appids_filter: [APP_COM_CONQUISTAS],
        include_appinfo: true,
        include_played_free_games: true,
      }),
    });
    const com = await chamar(chave, 'ISteamUserStats/GetPlayerAchievements/v1/', {
      steamid: id,
      appid: APP_COM_CONQUISTAS,
      l: 'brazilian',
    });
    const sem = await chamar(chave, 'ISteamUserStats/GetPlayerAchievements/v1/', {
      steamid: id,
      appid: APP_SEM_CONQUISTAS,
      l: 'brazilian',
    });
    console.log(
      `GetOwnedGames com appids_filter: HTTP ${filtrada.status} | ${JSON.stringify(filtrada.body).slice(0, 160)}`,
    );
    console.log(
      `GetPlayerAchievements (com conquistas): HTTP ${com.status} | ${JSON.stringify(com.body).slice(0, 200)}`,
    );
    console.log(
      `GetPlayerAchievements (sem conquistas): HTTP ${sem.status} | ${JSON.stringify(sem.body).slice(0, 200)}`,
    );
    gravar('player-summaries.privado.json', perfilSintetico(jogador, visibilidade));
    gravar('owned-games.privado.json', biblioteca);
    gravar('owned-games.privado-com-filtro.json', filtrada);
    gravar('player-achievements.privado.json', com);
    gravar('player-achievements.privado-sem-conquistas.json', sem);
  } else if (modo === 'detalhes-privados') {
    if (visibilidade !== 3) {
      console.log(`O perfil NÃO está público (veio ${visibilidade}). Nada foi gravado.`);
      return;
    }
    if ('game_count' in (biblioteca.body?.response ?? {})) {
      console.log(
        'Os "detalhes do jogo" ainda estão PÚBLICOS (a resposta trouxe game_count). Nada foi gravado.',
      );
      return;
    }
    const com = await chamar(chave, 'ISteamUserStats/GetPlayerAchievements/v1/', {
      steamid: id,
      appid: APP_COM_CONQUISTAS,
      l: 'brazilian',
    });
    const sem = await chamar(chave, 'ISteamUserStats/GetPlayerAchievements/v1/', {
      steamid: id,
      appid: APP_SEM_CONQUISTAS,
      l: 'brazilian',
    });
    console.log(
      `GetPlayerAchievements (com conquistas): HTTP ${com.status} | ${JSON.stringify(com.body).slice(0, 220)}`,
    );
    console.log(
      `GetPlayerAchievements (sem conquistas): HTTP ${sem.status} | ${JSON.stringify(sem.body).slice(0, 220)}`,
    );
    console.log(
      com.status === 403
        ? '=> conquistas negadas respondem HTTP 403 (como o SteamClient já assume).'
        : `=> NÃO é 403: veio HTTP ${com.status}. Ajuste o SteamClient.obterConquistasDoJogador e os CA-30/CA-47.`,
    );
    gravar('owned-games.detalhes-privados.json', biblioteca);
    gravar('player-achievements.negado.json', com);
    gravar('player-achievements.negado-sem-conquistas.json', sem);
  } else {
    if (visibilidade !== 3) {
      console.log(
        `O perfil da conta vazia NÃO está público (veio ${visibilidade}). Nada foi gravado.`,
      );
      return;
    }
    if (biblioteca.body?.response?.game_count !== 0) {
      console.log('A biblioteca NÃO veio com game_count 0. Nada foi gravado.');
      return;
    }
    gravar('player-summaries.vazio.json', perfilSintetico(jogador, visibilidade));
    gravar('owned-games.vazio.json', biblioteca);
  }
  console.log(
    'Fixtures gravados (sanitizados). Rode `npm test -w @checkpoint/api -- fixtures.spec` e revise a spec.',
  );
}

main().catch((erro) => {
  console.error(
    'ERRO:',
    erro.name,
    String(erro.message)
      .split(process.env.STEAM_API_KEY ?? '\u0000')
      .join('***'),
  );
  process.exit(1);
});
