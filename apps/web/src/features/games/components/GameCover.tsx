import { useState } from 'react';
import { coverBackground, coverInitials } from '@/shared/lib/game-cover';

interface GameCoverProps {
  titulo: string;
  /** URL pública da capa enviada, ou `null` para mostrar a capa gerada. */
  capaUrl: string | null;
  /** `row` = 52×52 da lista; `compacta` = 40×40 (densidade compacta); `preview` = 96×96 do formulário. */
  variant?: 'row' | 'compacta' | 'preview';
}

const SIZE = {
  row: 'size-[52px] text-[17px]',
  compacta: 'size-10 text-[14px]',
  preview: 'size-24 text-[30px]',
} as const;

/**
 * A imagem enviada ou, sem ela, a capa gerada: cor por hash do título + iniciais. Se a imagem falhar
 * ao carregar, volta para a gerada (CA-73). É decorativa: o título já está ao lado.
 */
export function GameCover({ titulo, capaUrl, variant = 'row' }: GameCoverProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = capaUrl !== null && failedUrl !== capaUrl;
  const base = `grid shrink-0 place-items-center overflow-hidden rounded-[4px] ${SIZE[variant]}`;

  if (showImage) {
    return (
      <div className={base} data-cover="image">
        <img
          src={capaUrl}
          alt=""
          className="block size-full object-cover"
          onError={() => setFailedUrl(capaUrl)}
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
