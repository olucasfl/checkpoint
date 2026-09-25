import { useState } from 'react';
import { coverBackground, coverInitials } from '@/shared/lib/game-cover';

interface GameCoverProps {
  titulo: string;
  /** URL pública da capa enviada, ou `null` para mostrar a capa gerada. */
  capaUrl: string | null;
  /**
   * Imagens de reserva, em ordem (a capa oficial da plataforma e o `header.jpg`): a primeira que carregar aparece.
   * Se todas faltarem ou falharem, vale a capa gerada.
   */
  alternativas?: readonly string[];
  /** `row` = 52×52 da lista; `compacta` = 40×40 (densidade compacta); `preview` = 96×96 do formulário; `detalhe` = a capa grande da página do jogo (quadrada, até 320 px). */
  variant?: 'row' | 'compacta' | 'preview' | 'detalhe';
}

const SIZE = {
  row: 'size-[52px] text-[17px]',
  compacta: 'size-10 text-[14px]',
  preview: 'size-24 text-[30px]',
  detalhe: 'aspect-square w-full max-w-[320px] text-[72px]',
} as const;

/**
 * A imagem enviada ou, sem ela, a capa gerada: cor por hash do título + iniciais. Se a imagem falhar
 * ao carregar, tenta a próxima de `alternativas` e, esgotadas, volta para a gerada (CA-73). É decorativa: o título já
 * está ao lado.
 */
export function GameCover({ titulo, capaUrl, alternativas = [], variant = 'row' }: GameCoverProps) {
  const [failedUrls, setFailedUrls] = useState<readonly string[]>([]);
  const candidatas = [capaUrl, ...alternativas].filter((url): url is string => url !== null);
  const shownUrl = candidatas.find((url) => !failedUrls.includes(url)) ?? null;
  const showImage = shownUrl !== null;
  const base = `grid shrink-0 place-items-center overflow-hidden rounded-[4px] ${SIZE[variant]}`;

  if (showImage) {
    return (
      <div className={base} data-cover="image">
        <img
          src={shownUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="block size-full object-cover"
          onError={() => setFailedUrls((atuais) => [...atuais, shownUrl])}
        />
      </div>
    );
  }

  return (
    <div
      aria-hidden="true"
      data-cover="generated"
      className={`${base} font-display font-extrabold text-fundo ${coverBackground(titulo)}`}
    >
      {coverInitials(titulo)}
    </div>
  );
}
