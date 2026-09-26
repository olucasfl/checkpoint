import { Link } from 'react-router-dom';
import { Icon } from '@/shared/components/Icon';

/** Carregando a página do jogo: capa, título e blocos de esqueleto (o brilho para com movimento reduzido). */
export function DetailLoading() {
  return (
    <div
      role="status"
      aria-label="Carregando jogo"
      aria-busy="true"
      className="flex flex-col gap-6 lg:flex-row lg:gap-10"
    >
      <div className="skeleton aspect-[3/4] w-full max-w-[300px] self-center rounded-[20px] lg:self-start" />
      <div className="flex flex-1 flex-col gap-4">
        <div className="skeleton h-9 w-2/3 rounded-md" />
        <div className="skeleton h-6 w-1/3 rounded-md" />
        <div className="skeleton h-28 w-full rounded-2xl" />
        <div className="skeleton h-44 w-full rounded-2xl" />
      </div>
    </div>
  );
}

/**
 * Id inexistente ou de OUTRO usuário: a mesma mensagem nos dois casos, para não revelar que o id existe
 * (a API já trata jogo alheio como inexistente).
 */
export function GameNotFound() {
  return (
    <div
      role="alert"
      data-state="not-found"
      className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-borda bg-painel p-6 text-center"
    >
      <Icon name="search_off" size={40} filled className="text-ouro" />
      <h1 className="m-0 font-display text-[18px] font-extrabold uppercase tracking-[0.12em]">
        Jogo não encontrado
      </h1>
      <p className="m-0 text-[17px] text-texto-suave">
        Ele pode ter sido removido, ou o link está errado.
      </p>
      <Link
        to="/"
        className="flex min-h-11 items-center gap-2 rounded-xl border border-borda-controle px-5 text-[16px] font-semibold text-destaque no-underline hover:bg-acao-hover"
      >
        <Icon name="arrow_back" size={20} />
        Voltar para os jogos
      </Link>
    </div>
  );
}
