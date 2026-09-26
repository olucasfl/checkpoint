import { useState } from 'react';
import { coverBackground, coverInitials } from '@/shared/lib/game-cover';

type Variante = 'tile' | 'tileCompacto' | 'detalhe' | 'preview';

interface GameCoverProps {
  titulo: string;
  /** URL pública da capa enviada, ou `null` para mostrar a capa gerada. */
  capaUrl: string | null;
  /**
   * Imagens de reserva, em ordem (a capa oficial da plataforma): a primeira que carregar aparece. Se todas faltarem
   * ou falharem, vale a capa gerada.
   */
  alternativas?: readonly string[];
  /**
   * Em pé (3:4), como as capas da estante: `tile` = 150 × 200 (132 × 176 no celular); `tileCompacto` = 120 × 160
   * (108 × 144); `detalhe` = a capa grande da página do jogo (até 300 × 400); `preview` = a miniatura do formulário.
   */
  variant?: Variante;
}

interface Forma {
  caixa: string;
  iniciais: string;
  anel?: string;
}

const FORMA: Record<Variante, Forma> = {
  tile: {
    caixa: 'w-[132px] md:w-[150px] aspect-[3/4] rounded-xl md:rounded-[14px]',
    iniciais: 'left-3 top-2.5 text-[42px] md:left-3.5 md:top-3 md:text-[50px]',
    anel: '-bottom-9 -left-7 size-[120px] border-[18px] md:size-[135px] md:border-[22px]',
  },
  tileCompacto: {
    caixa: 'w-[108px] md:w-[120px] aspect-[3/4] rounded-xl md:rounded-[14px]',
    iniciais: 'left-2.5 top-2 text-[34px] md:left-3 md:top-2.5 md:text-[40px]',
    anel: '-bottom-7 -left-6 size-[96px] border-[14px] md:size-[108px] md:border-[18px]',
  },
  detalhe: {
    caixa: 'aspect-[3/4] w-full max-w-[300px] rounded-[20px]',
    iniciais: 'left-6 top-5 text-[96px]',
    anel: '-bottom-[70px] -left-[60px] size-[280px] border-[40px]',
  },
  preview: {
    caixa: 'w-14 aspect-[3/4] rounded-lg',
    iniciais: 'left-2 top-1.5 text-[24px]',
  },
};

/**
 * A imagem enviada (ou a oficial da plataforma) ou, sem elas, a capa gerada: cor por hash do título + iniciais.
 * A imagem entra em 3:4 com `object-fit: cover` e recorte centralizado: uma capa larga perde as laterais e uma alta
 * perde topo e base. Se a imagem falhar ao carregar, tenta a próxima de `alternativas` e, esgotadas, volta para a
 * gerada (CA-73 do catálogo). É decorativa: o título já está ao lado.
 */
export function GameCover({
  titulo,
  capaUrl,
  alternativas = [],
  variant = 'tile',
}: GameCoverProps) {
  const [failedUrls, setFailedUrls] = useState<readonly string[]>([]);
  const candidatas = [capaUrl, ...alternativas].filter((url): url is string => url !== null);
  const shownUrl = candidatas.find((url) => !failedUrls.includes(url)) ?? null;
  const forma = FORMA[variant];
  const base = `relative shrink-0 overflow-hidden ${forma.caixa}`;

  if (shownUrl !== null) {
    return (
      <div className={base} data-cover="image">
        <img
          src={shownUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="block size-full object-cover object-center"
          onError={() => setFailedUrls((atuais) => [...atuais, shownUrl])}
        />
      </div>
    );
  }

  return (
    <div aria-hidden="true" data-cover="generated" className={`${base} ${coverBackground(titulo)}`}>
      <div className="capa-brilho absolute inset-0" />
      {forma.anel && <div className={`capa-anel absolute ${forma.anel}`} />}
      <span
        className={`capa-iniciais absolute font-display font-black leading-none ${forma.iniciais}`}
      >
        {coverInitials(titulo)}
      </span>
    </div>
  );
}
