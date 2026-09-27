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
  | { tipo: 'credencial'; rotuloDaCredencial: string };

export type VarianteDaMarca = 'marcador' | 'logo';

/** Regra da Valve para o logo da Steam (e adotada como piso para toda logo oficial): nunca abaixo de 50 px de altura na tela. */
export const ALTURA_MINIMA_DA_LOGO_PX = 50;

/** O ícone NEUTRO de origem, sem marca registrada: o que vai nos selos pequenos. `icone` é um glifo do Material Symbols. */
export interface MarcadorDaPlataforma {
  icone: string;
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
  /** "conquista/conquistas" na Steam, "troféu/troféus" na PlayStation. */
  vocabulario: { conquista: string; conquistas: string };
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
    marcador: { icone: 'link' },
    // Vetor extraído do PDF oficial da Valve, sem alteração (docs/design/plataformas/steam/); inverso (branco) para o tema escuro.
    logo: { arquivo: '/plataformas/steam-logo.svg', largura: 214, altura: 65 },
    ligadoA: 'à Steam',
    rotuloDaConta: 'Conta Steam',
    vinculo: {
      tipo: 'redirecionamento',
      hostDeLogin: 'steamcommunity.com',
      caminhoDeLogin: '/openid/login',
    },
    vocabulario: { conquista: 'conquista', conquistas: 'conquistas' },
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
    // Vira `true` na F2, junto com a tela de vínculo.
    disponivel: false,
    capacidades: ['horas', 'conquistas', 'biblioteca', 'ultimaVezJogado', 'nivel'],
    // Marcador NEUTRO: a marca oficial só entra quando o pacote da Sony for entregue (spec, "Marca e logos").
    marcador: { icone: 'videogame_asset' },
    logo: null,
    ligadoA: 'à PlayStation',
    rotuloDaConta: 'Conta PlayStation',
    vinculo: { tipo: 'credencial', rotuloDaCredencial: 'NPSSO' },
    vocabulario: { conquista: 'troféu', conquistas: 'troféus' },
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
