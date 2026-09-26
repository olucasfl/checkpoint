import { type DadosJogoPlataforma } from '@checkpoint/shared';
import { PlataformaMarca } from '@/shared/components/PlataformaMarca';
import { selosDoJogo } from '../lib/selo';

/**
 * O selo das plataformas a que o jogo está ligado, no canto superior esquerdo da capa (o anel da média fica no
 * superior direito, o chip de plataforma no inferior esquerdo e Editar/Remover no inferior direito). Só o marcador
 * neutro (sem marca registrada), discreto; um `role="img"` para o conjunto ("Ligado à Steam"), não um por logo. Não consulta a plataforma.
 */
export function SeloDePlataformas({ dados }: { dados: readonly DadosJogoPlataforma[] }) {
  const selos = selosDoJogo(dados);
  if (!selos) {
    return null;
  }
  return (
    <span
      role="img"
      aria-label={selos.rotulo}
      data-selo-plataformas
      className="capa-chip absolute left-2 top-2 flex h-6 items-center gap-1 rounded-full px-1.5 md:left-2.5 md:top-2.5"
    >
      {selos.visiveis.map((provedor) => (
        <span key={provedor} aria-hidden="true" className="flex">
          <PlataformaMarca provedor={provedor} variante="marcador" tamanho="p" decorativa />
        </span>
      ))}
      {selos.extras > 0 && (
        <span aria-hidden="true" className="text-xs font-bold text-texto">
          +{selos.extras}
        </span>
      )}
    </span>
  );
}
