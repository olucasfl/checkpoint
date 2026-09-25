import type { ButtonHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/shared/components/Icon';

/** A linha da lista (Conta, Preferências, App): 56 px de altura, bem acima dos 44 do toque. */
const LINHA =
  'flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left text-[17px] font-semibold hover:bg-acao-hover disabled:cursor-wait disabled:opacity-60';

interface ConteudoProps {
  icone: string;
  rotulo: string;
  /** Um resumo curto embaixo do rótulo (ex.: "Magenta · Confortável"). */
  detalhe?: string;
  /** O glifo da ponta; `null` quando a linha não leva a lugar nenhum (Sair). */
  seta?: string | null;
}

function Conteudo({ icone, rotulo, detalhe, seta = 'chevron_right' }: ConteudoProps) {
  return (
    <>
      <Icon name={icone} size={22} className="shrink-0 text-texto-suave" />
      {/* O resumo vai embaixo do rótulo: ao lado, em 375 px, o rótulo quebrava em duas linhas. */}
      <span className="flex min-w-0 flex-1 flex-col">
        <span>{rotulo}</span>
        {detalhe && (
          <span data-detalhe className="truncate text-[15px] font-medium text-texto-suave">
            {detalhe}
          </span>
        )}
      </span>
      {seta && <Icon name={seta} size={22} className="shrink-0 text-texto-suave" />}
    </>
  );
}

export function LinhaLink({ to, ...conteudo }: ConteudoProps & { to: string }) {
  return (
    <Link to={to} className={LINHA}>
      <Conteudo {...conteudo} />
    </Link>
  );
}

export function LinhaBotao({
  icone,
  rotulo,
  detalhe,
  seta,
  ...botao
}: ConteudoProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'>) {
  return (
    <button type="button" {...botao} className={LINHA}>
      <Conteudo icone={icone} rotulo={rotulo} detalhe={detalhe} seta={seta} />
    </button>
  );
}

/** O contêiner das linhas: cantos grandes, divisores finos entre elas, sem borda em volta. */
export function ListaDeLinhas({ children, rotulo }: { children: React.ReactNode; rotulo: string }) {
  return (
    <section aria-label={rotulo} className="flex flex-col gap-2">
      <h2 className="m-0 px-1 font-display text-sm font-bold uppercase tracking-[0.22em] text-texto-suave">
        {rotulo}
      </h2>
      <div className="flex flex-col divide-y divide-borda overflow-hidden rounded-2xl bg-painel">
        {children}
      </div>
    </section>
  );
}
