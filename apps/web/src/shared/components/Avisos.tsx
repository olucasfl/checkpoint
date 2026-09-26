import { useEffect, useRef, useState } from 'react';
import { Chek } from '@/shared/components/Chek/Chek';
import { Icon } from '@/shared/components/Icon';
import { OverlayPortal } from '@/shared/components/OverlayPortal';
import { useMovimentoReduzido } from '@/shared/hooks/use-movimento-reduzido';
import { dispensar, duracaoDoAviso, useFilaDeAvisos, type AvisoNaFila } from '@/shared/lib/avisos';

/** Duração da animação de saída (`--mov-padrao`). */
export const SAIDA_DO_AVISO_MS = 200;

function AvisoNaTela({ aviso }: { aviso: AvisoNaFila }) {
  const reduzido = useMovimentoReduzido();
  const [saindo, setSaindo] = useState(false);
  const [pausado, setPausado] = useState(false);
  const restante = useRef(duracaoDoAviso(aviso.texto, aviso.acao !== undefined));
  const inicio = useRef(0);

  // O tempo corre enquanto ninguém está com o mouse ou o foco no aviso; ao voltar, continua de onde parou.
  useEffect(() => {
    if (saindo || pausado) {
      return undefined;
    }
    inicio.current = Date.now();
    const timer = setTimeout(() => setSaindo(true), restante.current);
    return () => {
      clearTimeout(timer);
      restante.current = Math.max(0, restante.current - (Date.now() - inicio.current));
    };
  }, [pausado, saindo]);

  useEffect(() => {
    if (!saindo) {
      return undefined;
    }
    const timer = setTimeout(() => dispensar(aviso.id), reduzido ? 0 : SAIDA_DO_AVISO_MS);
    return () => clearTimeout(timer);
  }, [saindo, aviso.id, reduzido]);

  return (
    <div
      data-aviso={aviso.chek ?? 'sucesso'}
      // Só o mouse pausa: no toque o `mouseenter` emulado ficaria preso até o próximo toque fora do aviso.
      onPointerEnter={(evento) => evento.pointerType === 'mouse' && setPausado(true)}
      onPointerLeave={(evento) => evento.pointerType === 'mouse' && setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
      className={`${saindo ? 'aviso-out' : 'aviso-in'} pointer-events-auto mx-auto flex max-w-[640px] items-center gap-3 rounded-2xl border border-destaque bg-painel px-3.5 py-2.5 text-[16px] text-texto`}
    >
      {aviso.chek ? (
        <Chek expressao={aviso.chek} altura={40} />
      ) : (
        <span className="check-pop grid shrink-0 place-items-center">
          <Icon name="check_circle" size={24} filled className="text-status-zerado" />
        </span>
      )}
      <span className="min-w-0 flex-1">{aviso.texto}</span>
      {aviso.acao && (
        <button
          type="button"
          onClick={() => {
            aviso.acao?.aoClicar();
            setSaindo(true);
          }}
          className="min-h-11 shrink-0 rounded-full bg-destaque px-[18px] font-display text-[15px] font-extrabold text-fundo"
        >
          {aviso.acao.rotulo}
        </button>
      )}
      <button
        type="button"
        aria-label="Fechar aviso"
        onClick={() => setSaindo(true)}
        className="grid size-11 shrink-0 place-items-center rounded-full text-texto-suave hover:text-texto"
      >
        <Icon name="close" size={20} />
      </button>
    </div>
  );
}

/**
 * Os avisos de sucesso (`avisar()` em `shared/lib/avisos.ts`), um por vez, no `#overlay-root`. A região `role="status"`
 * existe SEMPRE (vazia sem aviso): uma região viva que já nasce com texto costuma não ser anunciada, e o texto que entra
 * depois dela é. No celular fica acima da barra inferior (e acima do aviso de versão e do convite de instalação, que o
 * CSS empurra); no desktop, embaixo no centro. Nunca rouba o foco.
 */
export function Avisos() {
  const atual = useFilaDeAvisos()[0];

  return (
    <OverlayPortal>
      <div role="status" aria-live="polite" className="aviso-pilha pointer-events-none fixed z-50">
        {atual && <AvisoNaTela key={atual.id} aviso={atual} />}
      </div>
    </OverlayPortal>
  );
}
