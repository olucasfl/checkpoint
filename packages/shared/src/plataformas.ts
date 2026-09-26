/**
 * Cadastro central das plataformas de jogos (spec `plataformas-e-pagina-do-jogo`, Parte A). Só dados, sem
 * `window`, Node nem Prisma. As telas leem este cadastro (o que a plataforma entrega, o nome, a logo) em vez de
 * comparar o provedor com um texto: uma plataforma nova é uma entrada aqui, um valor no enum `Provedor` do banco e
 * um `GameProvider` na API.
 */

/** O que uma plataforma consegue entregar; as telas perguntam por isto, nunca por "é a Steam?". */
export type CapacidadePlataforma =
  'horas' | 'conquistas' | 'biblioteca' | 'ultimaVezJogado' | 'nivel';

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
}

const CADASTRO = {
  STEAM: {
    id: 'STEAM',
    slug: 'steam',
    nome: 'Steam',
    nomeAcessivel: 'Steam',
    disponivel: true,
    capacidades: ['horas', 'conquistas', 'biblioteca', 'ultimaVezJogado', 'nivel'],
    marcador: { icone: 'link' },
    // Vetor extraído do PDF oficial da Valve, sem alteração (docs/design/plataformas/steam/); inverso (branco) para o tema escuro.
    logo: { arquivo: '/plataformas/steam-logo.svg', largura: 214, altura: 65 },
    ligadoA: 'à Steam',
    rotuloDaConta: 'Conta Steam',
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
