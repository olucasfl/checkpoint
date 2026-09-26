import { useState } from 'react';
import {
  ALTURA_MINIMA_DA_LOGO_PX,
  type Provedor,
  type VarianteDaMarca,
  plataformaPorId,
} from '@checkpoint/shared';
import { Icon } from './Icon';

export type TamanhoDoMarcador = 'p' | 'm' | 'g';

const TAMANHO: Record<TamanhoDoMarcador, number> = { p: 16, m: 20, g: 28 };

/** Espaço livre ao redor da logo, em fração da altura (regra da Valve: o diâmetro da manivela do símbolo; medida a conferir contra o PDF). */
const ESPACO_LIVRE = 0.2;

interface PlataformaMarcaProps {
  provedor: Provedor;
  /**
   * `marcador`: o ícone NEUTRO de origem (sem marca registrada), para selos e botões pequenos. `logo`: a marca oficial,
   * só onde couber com 50 px de altura ou mais e nunca como destaque de tela.
   */
  variante: VarianteDaMarca;
  /** Só do `marcador`. */
  tamanho?: TamanhoDoMarcador;
  /** Só da `logo`, em px. Abaixo de `ALTURA_MINIMA_DA_LOGO_PX` ela SOBE para o mínimo, nunca encolhe. */
  altura?: number;
  /** O texto ao lado já diz o nome: nada é lido a mais. */
  decorativa?: boolean;
  className?: string;
}

/**
 * A marca de uma plataforma: o único lugar do web que desenha o marcador ou a logo de uma plataforma. Lê só o
 * cadastro do `shared` (nenhum `if` por provedor). A logo é marca registrada: fica SOZINHA (nada colado), na cor do
 * arquivo (branco no tema escuro), com espaço livre ao redor e nunca com menos de 50 px de altura. Sem o arquivo, ou se
 * ele não carregar, cai no marcador com o nome em texto: a plataforma nunca some.
 */
export function PlataformaMarca({
  provedor,
  variante,
  tamanho = 'm',
  altura = ALTURA_MINIMA_DA_LOGO_PX,
  decorativa = false,
  className = '',
}: PlataformaMarcaProps) {
  const [falhou, setFalhou] = useState(false);
  const plataforma = plataformaPorId(provedor);

  if (variante === 'logo' && plataforma.logo && !falhou) {
    const { arquivo, largura, altura: alturaDoArquivo } = plataforma.logo;
    const alturaFinal = Math.max(altura, ALTURA_MINIMA_DA_LOGO_PX);
    const larguraFinal = Math.round((largura / alturaDoArquivo) * alturaFinal);
    const espaco = Math.round(alturaFinal * ESPACO_LIVRE);
    return (
      <span
        data-plataforma-logo={provedor}
        className={`inline-flex ${className}`}
        style={{ padding: espaco }}
      >
        <img
          src={arquivo}
          alt={decorativa ? '' : plataforma.nomeAcessivel}
          width={larguraFinal}
          height={alturaFinal}
          decoding="async"
          draggable={false}
          onError={() => setFalhou(true)}
          className="max-w-none shrink-0"
          style={{ height: alturaFinal, width: larguraFinal }}
        />
      </span>
    );
  }

  const px = TAMANHO[tamanho];
  const glifo = <Icon name={plataforma.marcador.icone} size={px} />;
  if (variante === 'logo') {
    // Logo pedida, mas sem arquivo (ou falhou): o marcador com o nome em texto.
    return (
      <span
        data-plataforma-marcador={provedor}
        className={`inline-flex items-center gap-1.5 font-display text-sm font-bold text-texto-suave ${className}`}
      >
        {glifo}
        {plataforma.nome}
      </span>
    );
  }
  return (
    <span
      data-plataforma-marcador={provedor}
      {...(decorativa
        ? { 'aria-hidden': true }
        : { role: 'img', 'aria-label': plataforma.nomeAcessivel })}
      className={`inline-flex text-texto-suave ${className}`}
    >
      {glifo}
    </span>
  );
}
