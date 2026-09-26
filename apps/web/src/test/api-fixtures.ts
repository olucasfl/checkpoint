import {
  type Conquista,
  type ContaVinculada,
  type DadosJogoPlataforma,
  type DetalheJogoPlataforma,
  type Game,
  type GameRatings,
  type GameStatus,
  type ItemBiblioteca,
  type PerfilPlataforma,
  type SessaoAtiva,
  type Usuario,
} from '@checkpoint/shared';

/**
 * Corpos SINTÉTICOS no formato exato que a API devolve (o `contrato-web.http.spec.ts` da API prova que a API devolve
 * esta forma, e `api-fixtures.test.ts` prova que estes dados a têm). Servem aos testes de página e ao mock do
 * navegador: assim o mock nunca inventa um formato que a API não tem. Dados óbvios e falsos (RULES.md §8).
 */

let contador = 0;
/** UUID v4 determinístico (o `id` real da API é UUID). */
export function uuid(): string {
  contador += 1;
  const hex = contador.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${hex}`;
}

export const notas = (
  gameplay: number | null = null,
  historia: number | null = null,
  graficos: number | null = null,
  trilhaSonora: number | null = null,
  performance: number | null = null,
): GameRatings => ({ gameplay, historia, graficos, trilhaSonora, performance });

/** A média que a API calcula: dos critérios preenchidos, com 1 casa decimal; `null` sem nenhum. */
export function media(n: GameRatings): number | null {
  const v = Object.values(n).filter((x): x is number => x !== null);
  return v.length === 0 ? null : Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10;
}

export const agora = new Date('2026-09-25T12:00:00.000Z');

export function dadosSteam(extra: Partial<DadosJogoPlataforma> = {}): DadosJogoPlataforma {
  return {
    provedor: 'STEAM',
    idExterno: '504230',
    minutosJogados: 2550,
    ultimaVezJogadoEm: '2026-09-23T12:00:00.000Z',
    conquistasTotal: 40,
    conquistasDesbloqueadas: 12,
    capaUrl: null,
    atualizadoEm: '2026-09-25T11:48:00.000Z',
    ...extra,
  };
}

let ordem = 0;
export function jogo(titulo: string, status: GameStatus, extra: Partial<Game> = {}): Game {
  ordem += 1;
  const n = extra.notas ?? notas();
  return {
    id: uuid(),
    titulo,
    plataforma: 'PC',
    status,
    notas: n,
    notaMedia: media(n),
    descricao: null,
    capaUrl: null,
    criadoEm: '2026-09-01T12:00:00.000Z',
    atualizadoEm: new Date(agora.getTime() - ordem * 3600_000).toISOString(),
    dadosPlataforma: [],
    ...extra,
  };
}

/** Um catálogo "bem comportado", com o que a estante mostra: os 3 status, com e sem Steam, com e sem média. */
export function jogosSinteticos(): Game[] {
  return [
    jogo('Hollow Knight', 'JOGANDO', {
      notas: notas(9, 8, 8.5, 9.5, 6.5),
      notaMedia: 8.3,
      capaUrl: 'https://exemplo.supabase.co/storage/v1/object/public/capas/u/g/capa.png',
      descricao: 'Explorei quase tudo.\nFalta o último chefe.',
      dadosPlataforma: [dadosSteam()],
    }),
    jogo('A'.repeat(120), 'JOGANDO', { plataforma: 'Xbox Series X|S', notas: notas(10) }),
    jogo('Sem vínculo e sem média', 'QUERO_JOGAR', { plataforma: null }),
    jogo('Zerado com Steam', 'ZERADO', {
      notas: notas(9.1),
      dadosPlataforma: [
        dadosSteam({ minutosJogados: 600, conquistasDesbloqueadas: 20, conquistasTotal: 20 }),
      ],
    }),
  ];
}

/** O que um catálogo de produção acumula e o mock feliz nunca tinha (título com HTML, plataforma fora da lista...). */
export function jogosFeios(): Game[] {
  const longa = Array.from(
    { length: 40 },
    (_, i) => `Linha ${i + 1}, com <b>HTML</b> & "aspas" e acentuação: ção, ñ, 日本語.`,
  )
    .join('\n')
    .slice(0, 1000);
  const base: Game[] = [
    jogo('<script>alert(1)</script> & "aspas" 🎮 título esquisito', 'JOGANDO', {
      plataforma: 'Steam Deck',
      descricao: longa,
      capaUrl: 'https://exemplo.supabase.co/404.png',
      notas: notas(0, 0, 0, 0, 0),
      notaMedia: 0,
    }),
    jogo('Zero conquistas', 'JOGANDO', {
      dadosPlataforma: [
        dadosSteam({
          minutosJogados: 123456,
          conquistasTotal: 0,
          conquistasDesbloqueadas: 0,
          ultimaVezJogadoEm: null,
        }),
      ],
    }),
    jogo('Conquistas nulas', 'ZERADO', {
      notas: notas(7.7),
      dadosPlataforma: [
        dadosSteam({
          minutosJogados: 45,
          conquistasTotal: null,
          conquistasDesbloqueadas: null,
          ultimaVezJogadoEm: null,
        }),
      ],
    }),
    jogo('Mesmo título', 'QUERO_JOGAR', { plataforma: 'PC' }),
    jogo('Mesmo título', 'QUERO_JOGAR', { plataforma: 'Nintendo Switch' }),
    jogo('Plataforma antiga', 'ZERADO', { plataforma: 'Atari 2600', notas: notas(3.2) }),
    jogo('a', 'JOGANDO', { plataforma: null }),
    jogo('Descrição só com quebras', 'JOGANDO', { descricao: '\n\n\n' }),
  ];
  const plataformas = [null, 'PC', 'PlayStation 5', 'Xbox Series X|S', 'Nintendo Switch'];
  const status: GameStatus[] = ['JOGANDO', 'QUERO_JOGAR', 'ZERADO'];
  const volume = Array.from({ length: 52 }, (_, i) => {
    const nota = Math.min(10, (i % 11) + 0.5);
    return jogo(`Volume ${String(i).padStart(2, '0')}`, status[i % 3] ?? 'JOGANDO', {
      plataforma: plataformas[i % 5] ?? null,
      notas: notas(nota),
    });
  });
  return [...base, ...volume];
}

export function conquistas(): Conquista[] {
  const c = (id: string, extra: Partial<Conquista>): Conquista => ({
    id,
    nome: `Conquista ${id}`,
    descricao: 'Descrição vinda da Steam.',
    oculta: false,
    desbloqueada: false,
    desbloqueadaEm: null,
    iconeUrl: null,
    raridadePercentual: 10,
    ...extra,
  });
  return [
    c('a1', {
      desbloqueada: true,
      desbloqueadaEm: '2026-09-20T12:00:00.000Z',
      iconeUrl: 'https://cdn.steamstatic.com/i.jpg',
      raridadePercentual: 62.1,
    }),
    c('a2', {
      desbloqueada: true,
      desbloqueadaEm: '2026-09-18T12:00:00.000Z',
      nome: 'Nome comprido que precisa quebrar em duas linhas no celular',
      raridadePercentual: null,
    }),
    c('f1', { raridadePercentual: 12.4 }),
    c('f2', { oculta: true, descricao: null, raridadePercentual: null }),
  ];
}

export function detalheSteam(extra: Partial<DetalheJogoPlataforma> = {}): DetalheJogoPlataforma {
  return { dados: dadosSteam(), conquistas: conquistas(), aviso: null, ...extra };
}

export const usuario: Usuario = {
  id: '11111111-1111-4111-8111-111111111111',
  nome: 'Pessoa Teste',
  email: 'usuario@exemplo.com',
  criadoEm: '2026-01-01T00:00:00.000Z',
};

export const conta: ContaVinculada = {
  provedor: 'STEAM',
  idExterno: 'STEAMID_SINTETICO',
  nomeExibicao: 'Jogador Sintetico',
  vinculadaEm: '2026-09-25T12:00:00.000Z',
};

export const perfilSteam: PerfilPlataforma = {
  provedor: 'STEAM',
  nomeExibicao: 'Jogador Sintetico',
  avatarUrl: null,
  perfilUrl: 'https://steamcommunity.com/id/x',
  totalJogos: 132,
  minutosTotais: 61234,
  maisJogados: [{ idExterno: '1', titulo: 'Hollow Knight', capaUrl: null, minutosJogados: 2550 }],
  conquistas: { desbloqueadas: 210, total: 640, jogosVinculados: 5 },
  consultadoEm: '2026-09-25T12:00:00.000Z',
};

export function biblioteca(): ItemBiblioteca[] {
  const parecido = { id: uuid(), titulo: 'Sem vínculo e sem média', plataforma: null };
  return [
    {
      idExterno: '100',
      titulo: 'Jogo Sintetico da Biblioteca',
      capaUrl: null,
      minutosJogados: 90,
      ultimaVezJogadoEm: null,
      jogosParecidos: [],
      vinculadoA: null,
    },
    {
      idExterno: '101',
      titulo: 'Outro item',
      capaUrl: null,
      minutosJogados: 0,
      ultimaVezJogadoEm: null,
      jogosParecidos: [parecido],
      vinculadoA: null,
    },
    {
      idExterno: '102',
      titulo: 'Já ligado',
      capaUrl: null,
      minutosJogados: 10,
      ultimaVezJogadoEm: '2026-02-01T00:00:00.000Z',
      jogosParecidos: [],
      vinculadoA: { ...parecido, plataforma: 'PC' },
    },
  ];
}

export const sessoes: SessaoAtiva[] = [
  {
    id: uuid(),
    dispositivo: 'Chrome · Windows',
    criadoEm: '2026-09-20T12:00:00.000Z',
    ultimoUsoEm: '2026-09-25T11:00:00.000Z',
    atual: true,
  },
  {
    id: uuid(),
    dispositivo: 'Safari · iPhone',
    criadoEm: '2026-09-10T12:00:00.000Z',
    ultimoUsoEm: '2026-09-24T11:00:00.000Z',
    atual: false,
  },
];
