import { useState } from 'react';
import { Link } from 'react-router-dom';
import { type Game } from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';
import { capasDoJogo } from '@/features/integracoes/lib/capa';
import { coverBackground, coverInitials } from '@/shared/lib/game-cover';
import { chipsDoDestaque } from '../lib/estante';
import { platformIcon } from '../lib/status-meta';

const CHIP =
  'chip-escuro inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-bold text-texto md:h-8 md:px-3 md:text-[13px]';

/**
 * "Continue de onde parou": o jogo Jogando mais recente (regra em `destaqueDoCatalogo`). Cartão de 176 px no celular
 * (o cartão INTEIRO é o link para o detalhe) e de 230 px no desktop (o link é o botão "Ver detalhes"). O fundo é a
 * capa do jogo (enviada ou oficial) sob um degradê escuro à esquerda; sem imagem, a cor gerada com as iniciais como
 * marca d'água. O texto ocupa no máximo 50% da largura no desktop (60% no celular), onde o escurecimento garante o
 * contraste; os chips têm fundo escuro próprio. Horas e conquistas só aparecem nos jogos ligados à Steam.
 */
export function DestaqueContinue({ game }: { game: Game }) {
  const [falharam, setFalharam] = useState<readonly string[]>([]);
  const imagem = capasDoJogo(game).find((url) => !falharam.includes(url)) ?? null;
  const chips = chipsDoDestaque(game);
  const rotuloId = `destaque-rotulo-${game.id}`;

  return (
    <section
      aria-labelledby={rotuloId}
      data-destaque-catalogo
      className={`relative isolate min-h-44 overflow-hidden rounded-[20px] md:min-h-[230px] md:rounded-3xl ${imagem ? 'bg-painel-2' : coverBackground(game.titulo)}`}
    >
      {imagem ? (
        <img
          src={imagem}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 -z-10 block size-full object-cover object-center"
          onError={() => setFalharam((atuais) => [...atuais, imagem])}
        />
      ) : (
        <span
          aria-hidden="true"
          className="absolute -bottom-7 -right-2 -z-10 font-display text-[170px] font-black leading-none text-fundo/30 md:-bottom-10 md:right-12 md:text-[230px]"
        >
          {coverInitials(game.titulo)}
        </span>
      )}
      <div aria-hidden="true" className="destaque-scrim absolute inset-0 -z-10" />

      <div className="flex min-h-44 max-w-[85%] flex-col justify-center gap-2 p-5 md:relative md:min-h-[230px] md:max-w-[50%] md:gap-2.5 md:px-10 md:py-6">
        <div
          id={rotuloId}
          className="destaque-rotulo flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] md:gap-2 md:text-[13px] md:tracking-[0.16em]"
        >
          <Icon name="play_circle" size={18} filled />
          Continue de onde parou
        </div>
        <h2 className="tile-titulo m-0 shrink-0 font-display text-[32px] font-extrabold leading-none tracking-[-0.02em] text-texto md:text-[52px]">
          {game.titulo}
        </h2>
        <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
          {chips.plataforma && (
            <span className={`${CHIP} max-md:hidden`}>
              <Icon name={platformIcon(chips.plataforma)} size={16} />
              {chips.plataforma}
            </span>
          )}
          {chips.media && (
            <span className={CHIP}>
              <Icon name="star" size={16} filled className="text-ouro" />
              {chips.media}
            </span>
          )}
          {chips.horas && (
            <span className={CHIP}>
              <Icon name="schedule" size={16} />
              <span className="max-md:hidden">{chips.horas}</span>
              <span className="md:hidden">{chips.horas.replace(' na Steam', '')}</span>
            </span>
          )}
          {chips.conquistas && (
            <span className={CHIP}>
              <Icon name="military_tech" size={16} filled className="text-ouro" />
              <span className="max-md:hidden">{chips.conquistas}</span>
              <span className="md:hidden">{chips.conquistas.replace(' conquistas', '')}</span>
            </span>
          )}
        </div>
        {/* Um só link: cobre o cartão no celular (texto invisível, o nome acessível continua) e vira o botão no desktop. */}
        <Link
          to={`/jogos/${game.id}`}
          className="absolute inset-0 z-10 md:static md:z-auto md:mt-1 md:inline-flex md:h-11 md:items-center md:gap-2 md:self-start md:rounded-full md:bg-texto md:px-5 md:font-display md:text-[15px] md:font-bold md:text-fundo"
        >
          {/* `.icon` tem display próprio: o `hidden` direto no ícone não valeria no celular. */}
          <span aria-hidden="true" className="hidden md:inline-flex">
            <Icon name="visibility" size={20} />
          </span>
          <span className="max-md:sr-only">Ver detalhes</span>
        </Link>
      </div>
    </section>
  );
}
