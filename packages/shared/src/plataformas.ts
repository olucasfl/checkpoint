/**
 * Cadastro central das plataformas de jogos (spec `plataformas-e-pagina-do-jogo`, Parte A). Só dados, sem
 * `window`, Node nem Prisma. As telas leem este cadastro (o que a plataforma entrega, o nome, a logo) em vez de
 * comparar o provedor com um texto: uma plataforma nova é uma entrada aqui, um valor no enum `Provedor` do banco e
 * um `GameProvider` na API.
 */

/** O que uma plataforma consegue entregar; as telas perguntam por isto, nunca por "é a Steam?". */
export type CapacidadePlataforma =
  'horas' | 'conquistas' | 'biblioteca' | 'ultimaVezJogado' | 'nivel' | 'backlog';

/**
 * Como a conta é vinculada. Steam: o navegador vai até a plataforma e volta (OpenID). PlayStation: não há
 * redirecionamento, o usuário cola uma credencial no app (`rotuloDaCredencial`, ex.: "NPSSO"). As telas decidem
 * o fluxo por este campo, nunca comparando o provedor.
 */
export type VinculoDaPlataforma =
  | { tipo: 'redirecionamento'; hostDeLogin: string; caminhoDeLogin: string }
  | {
      tipo: 'credencial';
      /** Como a credencial se chama ("NPSSO"). */
      rotuloDaCredencial: string;
      /** O que ela é e por que o app a pede, em linguagem simples. */
      explicacao: string;
      /** Onde a pessoa a copia (uma página da própria plataforma, que ELA abre sozinha; nunca montada pelo app). */
      enderecoDaCredencial: string;
      passos: readonly string[];
      /** O aviso final (ex.: como invalidar a credencial depois). */
      observacao: string;
    };

export type VarianteDaMarca = 'marcador' | 'logo';

/** Regra da Valve para o logo da Steam (e adotada como piso para toda logo oficial): nunca abaixo de 50 px de altura na tela. */
export const ALTURA_MINIMA_DA_LOGO_PX = 50;

/** O ícone NEUTRO de origem, sem marca registrada: o que vai nos selos pequenos. `icone` é um glifo do Material Symbols. */
export interface MarcadorDaPlataforma {
  icone: string;
  /** O símbolo da plataforma (SVG de uma cor em `apps/web/public/`), desenhado na cor do texto. Sem ele, vale o `icone`. */
  simbolo?: string;
}

/** A marca OFICIAL (um arquivo em `apps/web/public/`), só para onde ela couber com `ALTURA_MINIMA_DA_LOGO_PX`. */
export interface LogoOficial {
  arquivo: string;
  largura: number;
  altura: number;
}

export interface PlataformaInfo {
  /** O código do enum `Provedor` do banco. */
  id: string;
  /** O segmento `:provedor` das rotas, em minúsculas. */
  slug: string;
  /** Texto de tela. */
  nome: string;
  /** Nome para leitor de tela (alt e `aria-label` da logo). */
  nomeAcessivel: string;
  /** `true` só para quem já tem um `GameProvider` na API. Fora disso a plataforma não aparece nas telas. */
  disponivel: boolean;
  capacidades: readonly CapacidadePlataforma[];
  marcador: MarcadorDaPlataforma;
  /** `null` = sem logo oficial no repositório: quem a pede cai no marcador com o nome. */
  logo: LogoOficial | null;
  /** Para "Ligado à Steam" / "Ligado ao Xbox": a preposição com o artigo já contraída. */
  ligadoA: string;
  /** Como a conta é chamada na tela ("Conta Steam"). */
  rotuloDaConta: string;
  vinculo: VinculoDaPlataforma;
  /**
   * "conquista/conquistas" na Steam, "troféu/troféus" na PlayStation. `artigo` é o artigo do plural ("as conquistas",
   * "os troféus"): os textos concordam com ele ("mostradas"/"mostrados").
   */
  vocabulario: { conquista: string; conquistas: string; artigo: 'as' | 'os' };
  /** O que aparece quando o jogo não tem conquistas/troféus lidos. */
  textoSemConquistas: string;
  /** A página do jogo na loja da plataforma (`{id}` vira o id do item); `null` quando não há link estável. */
  paginaDoJogo: { modelo: string; formatoDoId: string } | null;
  /** O formato da capa na busca da biblioteca: `paisagem` (Steam, 460x215) ou `quadrada` (o ícone do jogo na PlayStation). */
  capaNaBusca: 'paisagem' | 'quadrada';
  /** Textos de plataforma do jogo que combinam com esta (para a confirmação ao ligar um jogo). */
  plataformasCompativeis: readonly string[];
  /** Plataforma sugerida a um jogo novo quando o item não traz uma (Steam: 'PC'; PlayStation: `null`). */
  plataformaPadrao: string | null;
  /** O passo a passo para deixar o perfil público, quando a plataforma exige isso; `null` quando não existe. */
  privacidade: { passos: readonly string[] } | null;
  /** O rodapé legal do popup da conta: a atribuição (quando a marca exige) e o "não afiliado". */
  rodapeLegal: { atribuicao: string | null; naoAfiliado: string };
}

const CADASTRO = {
  STEAM: {
    id: 'STEAM',
    slug: 'steam',
    nome: 'Steam',
    nomeAcessivel: 'Steam',
    disponivel: true,
    capacidades: ['horas', 'conquistas', 'biblioteca', 'ultimaVezJogado', 'nivel', 'backlog'],
    // Só o símbolo, pequeno, com o nome em texto ao lado. O logo grande (`steam-logo.svg`, do PDF da Valve) não é mais usado.
    marcador: { icone: 'link', simbolo: '/plataformas/steam.svg' },
    logo: null,
    ligadoA: 'à Steam',
    rotuloDaConta: 'Conta Steam',
    vinculo: {
      tipo: 'redirecionamento',
      hostDeLogin: 'steamcommunity.com',
      caminhoDeLogin: '/openid/login',
    },
    vocabulario: { conquista: 'conquista', conquistas: 'conquistas', artigo: 'as' },
    capaNaBusca: 'paisagem',
    textoSemConquistas: 'Este jogo não tem conquistas.',
    paginaDoJogo: { modelo: 'https://store.steampowered.com/app/{id}', formatoDoId: '^\\d{1,10}$' },
    plataformasCompativeis: ['PC', 'Steam Deck'],
    plataformaPadrao: 'PC',
    privacidade: {
      passos: [
        'Abra a Steam e vá em Perfil › Editar perfil › Configurações de privacidade.',
        'Deixe "Meu perfil" como Público.',
        'Deixe "Detalhes do jogo" como Público.',
        'Espere alguns minutos (a Steam demora a aplicar) e toque em "Tentar de novo".',
      ],
    },
    rodapeLegal: {
      atribuicao:
        '©2024 Valve Corporation. Steam and the Steam logo are trademarks and/or registered trademarks of Valve Corporation in the U.S. and/or other countries. All rights reserved.',
      naoAfiliado: 'Não afiliado à Valve',
    },
  },
  PLAYSTATION: {
    id: 'PLAYSTATION',
    slug: 'playstation',
    nome: 'PlayStation',
    nomeAcessivel: 'PlayStation',
    // Só a interface: o provider da API depende da chave de cifra (sem ela as rotas respondem 400 `VALIDACAO`).
    disponivel: true,
    capacidades: ['horas', 'conquistas', 'biblioteca', 'ultimaVezJogado', 'nivel'],
    // Só o símbolo (SVG de uma cor); o pacote oficial da Sony ainda pode substituir o arquivo (spec, "Marca e logos").
    marcador: { icone: 'videogame_asset', simbolo: '/plataformas/playstation.svg' },
    logo: null,
    ligadoA: 'à PlayStation',
    rotuloDaConta: 'Conta PlayStation',
    vinculo: {
      tipo: 'credencial',
      rotuloDaCredencial: 'NPSSO',
      explicacao:
        'É um código que a PlayStation dá ao navegador quando você entra na sua conta. Com ele, o checkpoint consegue ler os seus jogos, horas e troféus.',
      enderecoDaCredencial: 'ca.account.sony.com/api/v1/ssocookie',
      passos: [
        'Entre na sua conta em playstation.com neste navegador.',
        'Em outra aba, abra o endereço abaixo.',
        'Copie o valor que aparece depois de "npsso": (são 64 letras e números, sem as aspas).',
        'Volte aqui e cole no campo.',
      ],
      observacao: 'Você pode trocar sua senha da PSN depois para invalidar o código.',
    },
    vocabulario: { conquista: 'troféu', conquistas: 'troféus', artigo: 'os' },
    capaNaBusca: 'quadrada',
    textoSemConquistas:
      'Os troféus só aparecem depois que o console sincroniza com a PSN. Se este jogo tem troféus, abra-o no console e sincronize.',
    // Sem link estável para a página do jogo na PlayStation Store: nada de "Abrir na PlayStation".
    paginaDoJogo: null,
    plataformasCompativeis: ['PS1', 'PS2', 'PS3', 'PS4', 'PS5', 'PSP'],
    plataformaPadrao: null,
    privacidade: null,
    // Provisório: sem inventar atribuição legal até o humano entregar as diretrizes da Sony.
    rodapeLegal: { atribuicao: null, naoAfiliado: 'Não afiliado à Sony Interactive Entertainment' },
  },
} as const satisfies Record<string, PlataformaInfo>;

/** Códigos do enum `Provedor` do banco: derivados do cadastro (uma fonte só). */
export type Provedor = keyof typeof CADASTRO;

export const PLATAFORMAS: { readonly [P in Provedor]: PlataformaInfo & { readonly id: P } } =
  CADASTRO;

/** Ordem de exibição das plataformas (a do cadastro). */
export const PLATAFORMAS_EM_ORDEM: readonly PlataformaInfo[] = Object.values(PLATAFORMAS);

export const PROVEDORES = Object.keys(PLATAFORMAS) as readonly Provedor[];

/** O segmento `:provedor` das rotas, em minúsculas. */
export const PROVEDOR_SLUG: Record<Provedor, string> = Object.fromEntries(
  PROVEDORES.map((id) => [id, PLATAFORMAS[id].slug]),
) as Record<Provedor, string>;

export function plataformaPorId(id: Provedor): PlataformaInfo {
  return PLATAFORMAS[id];
}

export function temCapacidade(id: Provedor, capacidade: CapacidadePlataforma): boolean {
  return PLATAFORMAS[id].capacidades.includes(capacidade);
}

/** As plataformas que a interface pode mostrar hoje (com provider na API), na ordem do cadastro. */
export function plataformasDisponiveis(): readonly PlataformaInfo[] {
  return PLATAFORMAS_EM_ORDEM.filter((plataforma) => plataforma.disponivel);
}
