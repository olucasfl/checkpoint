/**
 * SINTÉTICO: derivado dos TIPOS do psn-api 2.18.1, não é resposta real da Sony (spec integracao-playstation, D6). Não
 * havia NPSSO de teste para capturar respostas reais, então todo teste que usa isto e depende do formato real fica
 * `[~]` na spec. Nomes de jogo, de conta e IDs são fictícios e óbvios; tokens e NPSSO levam `SINTETICO` no nome.
 */

export const NPSSO_SINTETICO = 'NPSSO_SINTETICO_0123456789abcdefghijklmnopqrstuvwxyz0123456789';
export const REFRESH_SINTETICO = 'REFRESH_SINTETICO_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const REFRESH_NOVO_SINTETICO = 'REFRESH_NOVO_SINTETICO_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345';
export const ACCESS_SINTETICO = 'ACCESS_SINTETICO_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const ACCOUNT_ID_SINTETICO = '1234567890123456789';
export const TITLE_PS5 = 'PPSA01234_00';
export const TITLE_PS4 = 'CUSA01234_00';
export const NP_COMM_ID = 'NPWR00000_00';

export const tokensSinteticos = {
  accessToken: ACCESS_SINTETICO,
  expiresIn: 3600,
  idToken: 'ID_SINTETICO',
  refreshToken: REFRESH_SINTETICO,
  refreshTokenExpiresIn: 5_184_000,
  scope: 'psn:mobile.v2.core',
  tokenType: 'bearer',
};

export const resumoDeTrofeus = {
  accountId: ACCOUNT_ID_SINTETICO,
  trophyLevel: '312',
  progress: 42,
  tier: 4,
  earnedTrophies: { bronze: 100, silver: 50, gold: 20, platinum: 3 },
};

export const perfil = {
  onlineId: 'conta_exemplo',
  aboutMe: '',
  avatars: [
    { size: 'xl', url: 'https://image.api.playstation.com/exemplo/avatar-xl.png' },
    { size: 'l', url: 'https://image.api.playstation.com/exemplo/avatar-l.png' },
  ],
  languages: ['pt'],
  isPlus: false,
  isOfficiallyVerified: false,
  isMe: true,
};

function titulo(titleId: string, name: string, category: string, playDuration: string) {
  return {
    titleId,
    name,
    localizedName: name,
    imageUrl: `https://image.api.playstation.com/exemplo/${titleId}.png`,
    localizedImageUrl: '',
    category,
    service: 'none_purchased',
    playCount: 3,
    concept: { id: 1, titleIds: [titleId], name, media: { audios: [], videos: [], images: [] } },
    media: {},
    firstPlayedDateTime: '2025-01-01T10:00:00Z',
    lastPlayedDateTime: '2026-03-01T22:30:00Z',
    playDuration,
  };
}

export const jogadosDuasVersoes = {
  titles: [
    titulo(TITLE_PS5, 'Jogo Exemplo', 'ps5_native_game', 'PT228H56M33S'),
    titulo(TITLE_PS4, 'Jogo Exemplo', 'ps4_game', 'PT12H'),
    titulo('PPSA05555_00', 'Jogo de PC Exemplo', 'pspc_game', 'PT45M'),
    titulo('CUSA09999_00', 'Jogo Sem Categoria', 'unknown', 'PT0S'),
  ],
  totalItemCount: 4,
  nextOffset: 4,
  previousOffset: 0,
};

export const conjuntoDoTitulo = {
  titles: [
    {
      npTitleId: TITLE_PS5,
      trophyTitles: [
        {
          npServiceName: 'trophy2',
          npCommunicationId: NP_COMM_ID,
          trophySetVersion: '01.00',
          trophyTitleName: 'Jogo Exemplo',
          trophyTitleIconUrl: 'https://image.api.playstation.com/exemplo/t.png',
          trophyTitlePlatform: 'PS5',
          hasTrophyGroups: false,
          definedTrophies: { bronze: 3, silver: 1, gold: 1, platinum: 1 },
          progress: 50,
          earnedTrophies: { bronze: 2, silver: 1, gold: 0, platinum: 0 },
          hiddenFlag: false,
          lastUpdatedDateTime: '2026-03-01T22:30:00Z',
        },
      ],
    },
  ],
};

/** 6 troféus: platina, ouro, prata, 3 bronzes (um oculto), mais um de DLC. */
export const definicoesDeTrofeus = {
  trophySetVersion: '01.00',
  hasTrophyGroups: true,
  totalItemCount: 6,
  trophies: [
    def(0, 'platinum', 'Tudo Exemplo', 'Ganhe todos.', false, 'default'),
    def(1, 'gold', 'Ouro Exemplo', 'Faça o ouro.', false, 'default'),
    def(2, 'silver', 'Prata Exemplo', 'Faça a prata.', false, 'default'),
    def(3, 'bronze', 'Bronze Exemplo', 'Faça o bronze.', false, 'default'),
    def(4, 'bronze', 'Segredo Exemplo', 'Descrição que não pode sair.', true, 'default'),
    def(5, 'bronze', 'DLC Exemplo', 'Do conteúdo extra.', false, '001'),
  ],
};

function def(
  trophyId: number,
  trophyType: string,
  trophyName: string,
  trophyDetail: string,
  trophyHidden: boolean,
  trophyGroupId: string,
) {
  return {
    trophyId,
    trophyHidden,
    trophyType,
    trophyName,
    trophyDetail,
    trophyIconUrl: `https://psnobj.prod.dl.playstation.net/exemplo/${trophyId}.png`,
    trophyGroupId,
  };
}

export const ganhosDeTrofeus = {
  trophySetVersion: '01.00',
  hasTrophyGroups: true,
  lastUpdatedDateTime: '2026-03-01T22:30:00Z',
  totalItemCount: 6,
  trophies: [
    ganho(0, false, undefined, '0.9', 0),
    ganho(1, false, undefined, '4.8', 2),
    ganho(2, true, '2026-02-01T10:00:00Z', '18.5', 3),
    ganho(3, true, '2026-02-02T10:00:00Z', '60.1', 3),
    ganho(4, false, undefined, '1.2', 1),
    ganho(5, true, '2026-02-03T10:00:00Z', '30', 3),
  ],
};

function ganho(
  trophyId: number,
  earned: boolean,
  earnedDateTime: string | undefined,
  trophyEarnedRate: string,
  trophyRare: number,
) {
  return {
    trophyId,
    trophyHidden: false,
    trophyType: 'bronze',
    earned,
    earnedDateTime,
    trophyEarnedRate,
    trophyRare,
  };
}
