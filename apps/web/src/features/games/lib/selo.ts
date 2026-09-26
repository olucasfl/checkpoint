import {
  type DadosJogoPlataforma,
  type PlataformaInfo,
  type Provedor,
  PLATAFORMAS_EM_ORDEM,
} from '@checkpoint/shared';

/** Quantos selos cabem no tile antes de virar "+N". */
export const SELOS_VISIVEIS = 2;

export interface SelosDoJogo {
  /** Os provedores que aparecem, na ordem do cadastro. */
  visiveis: Provedor[];
  /** Quantos ficaram de fora ("+N"). */
  extras: number;
  rotulo: string;
}

/**
 * A regra do selo do tile: um por ligação, na ordem do cadastro, até 2, o resto vira "+N". `null` sem ligação.
 * `cadastro` só existe para o teste cobrir 3 plataformas com o cadastro real ainda tendo uma.
 */
export function selosDoJogo(
  dados: readonly DadosJogoPlataforma[],
  cadastro: readonly PlataformaInfo[] = PLATAFORMAS_EM_ORDEM,
): SelosDoJogo | null {
  const ligadas = cadastro.filter((p) => dados.some((d) => d.provedor === p.id));
  if (ligadas.length === 0) {
    return null;
  }
  const visiveis = ligadas.slice(0, SELOS_VISIVEIS);
  const extras = ligadas.length - visiveis.length;
  const nomes = visiveis.map((p) => p.nome);
  let rotulo: string;
  if (ligadas.length === 1) {
    rotulo = `Ligado ${visiveis[0]!.ligadoA}`;
  } else if (extras > 0) {
    rotulo = `Ligado a ${nomes.join(', ')} e mais ${extras}`;
  } else {
    rotulo = `Ligado a ${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
  }
  return { visiveis: visiveis.map((p) => p.id as Provedor), extras, rotulo };
}
