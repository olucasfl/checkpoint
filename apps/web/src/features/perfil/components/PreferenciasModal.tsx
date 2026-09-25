import { useState } from 'react';
import { ModalDialog } from '@/shared/components/ModalDialog';
import { usePrefs } from '@/shared/hooks/use-prefs';
import {
  MAX_FAVORITAS,
  PREFS_PADRAO,
  type Densidade,
  type Destaque,
  type Efeitos,
  type FiltroInicial,
  type Prefs,
} from '@/shared/lib/prefs/prefs';
import { alterarPrefs } from '@/shared/lib/prefs/prefs-store';
import { Abas, idDaAba, idDoPainel, type Aba } from './Abas';
import { AVISO_LIMITE_FAVORITAS, ChipsPlataformas } from './ChipsPlataformas';
import { GrupoOpcoes, type Opcao } from './GrupoOpcoes';
import { PreviaDensidade, PreviaEfeitos } from './PreviasAparencia';

/** A amostra é o próprio token da cor (sem hex): o mesmo que o `html[data-destaque]` usa. */
const DESTAQUE: readonly Opcao<Destaque>[] = [
  { valor: 'azul', rotulo: 'Azul', cor: 'bg-acento' },
  { valor: 'violeta', rotulo: 'Violeta', cor: 'bg-capa-6' },
  { valor: 'rosa', rotulo: 'Rosa', cor: 'bg-capa-2' },
  { valor: 'laranja', rotulo: 'Laranja', cor: 'bg-capa-3' },
];

const FILTRO: readonly Opcao<FiltroInicial>[] = [
  { valor: 'TODOS', rotulo: 'Todos' },
  { valor: 'JOGANDO', rotulo: 'Jogando' },
  { valor: 'QUERO_JOGAR', rotulo: 'Quero jogar' },
  { valor: 'ZERADO', rotulo: 'Zerado' },
];

const DENSIDADE: readonly Opcao<Densidade>[] = [
  { valor: 'confortavel', rotulo: 'Confortável' },
  { valor: 'compacta', rotulo: 'Compacta' },
];

const EFEITOS: readonly Opcao<Efeitos>[] = [
  { valor: 'completos', rotulo: 'Completas' },
  { valor: 'reduzidos', rotulo: 'Reduzidas' },
];

const ABAS = [
  { id: 'aparencia', rotulo: 'Aparência' },
  { id: 'catalogo', rotulo: 'Catálogo' },
  { id: 'plataformas', rotulo: 'Plataformas' },
] as const satisfies readonly Aba[];

type AbaId = (typeof ABAS)[number]['id'];

const BASE = 'prefs';

/** O resumo da linha de Preferências no /perfil: a cor e a densidade em uso, ex.: "Azul · Confortável". */
export function resumoDasPreferencias(prefs: Prefs): string {
  const cor = DESTAQUE.find((o) => o.valor === prefs.destaque)?.rotulo;
  const densidade = DENSIDADE.find((o) => o.valor === prefs.densidade)?.rotulo;
  return [cor, densidade].filter(Boolean).join(' · ');
}

/** O que "Restaurar padrões" devolve em cada aba: só as preferências dela. */
const PADROES_DA_ABA: Record<AbaId, Partial<Prefs>> = {
  aparencia: {
    destaque: PREFS_PADRAO.destaque,
    densidade: PREFS_PADRAO.densidade,
    efeitos: PREFS_PADRAO.efeitos,
  },
  catalogo: { filtroInicial: PREFS_PADRAO.filtroInicial },
  plataformas: { plataformasFavoritas: PREFS_PADRAO.plataformasFavoritas },
};

function Conteudo({ onConcluir }: { onConcluir: () => void }) {
  const prefs = usePrefs();
  const [aba, setAba] = useState<AbaId>('aparencia');
  const [aviso, setAviso] = useState('');
  const favoritas = prefs.plataformasFavoritas;

  function alternarFavorita(plataforma: string, marcar: boolean) {
    if (!marcar) {
      setAviso('');
      alterarPrefs({ plataformasFavoritas: favoritas.filter((p) => p !== plataforma) });
      return;
    }
    if (favoritas.length >= MAX_FAVORITAS) {
      setAviso(AVISO_LIMITE_FAVORITAS);
      return;
    }
    setAviso('');
    alterarPrefs({ plataformasFavoritas: [...favoritas, plataforma] });
  }

  function restaurar() {
    setAviso('');
    alterarPrefs(PADROES_DA_ABA[aba]);
  }

  const painel = (id: AbaId) => ({
    id: idDoPainel(BASE, id),
    role: 'tabpanel' as const,
    'aria-labelledby': idDaAba(BASE, id),
    hidden: aba !== id,
    className: 'flex flex-col gap-6 pb-1 pt-5',
  });

  return (
    <div className="sheet-pad flex flex-col gap-4 px-6 pt-6">
      <div>
        <h2
          id="prefs-titulo"
          className="m-0 font-display text-xl font-extrabold uppercase tracking-[0.12em]"
        >
          Preferências
        </h2>
        <p className="m-0 text-[15px] text-texto-suave">
          Salvas só neste aparelho. Mudam na hora, sem Salvar.
        </p>
      </div>

      <Abas
        base={BASE}
        rotulo="Preferências do aparelho"
        abas={ABAS}
        ativa={aba}
        onChange={(id) => setAba(id as AbaId)}
      />

      {/* Altura fixa, e a rolagem só aqui: trocar de aba não faz o modal pular, e o rodapé fica sempre
          à vista, até em janela baixa (o quadro encolhe com a tela, de 14rem a 32rem). */}
      <div
        data-painel-rolavel
        className="h-[clamp(14rem,calc(100dvh-19rem),32rem)] overflow-y-auto overscroll-contain pr-1"
      >
        <div {...painel('aparencia')}>
          <GrupoOpcoes
            id="pref-destaque"
            titulo="Cor de destaque"
            variante="bolinha"
            opcoes={DESTAQUE}
            valor={prefs.destaque}
            onChange={(destaque) => alterarPrefs({ destaque })}
          />
          <div className="flex flex-col gap-2.5">
            <GrupoOpcoes
              id="pref-densidade"
              titulo="Densidade da lista"
              opcoes={DENSIDADE}
              valor={prefs.densidade}
              onChange={(densidade) => alterarPrefs({ densidade })}
            />
            <PreviaDensidade densidade={prefs.densidade} />
          </div>
          <div className="flex flex-col gap-2.5">
            <GrupoOpcoes
              id="pref-efeitos"
              titulo="Animações"
              opcoes={EFEITOS}
              valor={prefs.efeitos}
              onChange={(efeitos) => alterarPrefs({ efeitos })}
            />
            <PreviaEfeitos efeitos={prefs.efeitos} />
          </div>
        </div>

        <div {...painel('catalogo')}>
          <GrupoOpcoes
            id="pref-filtro"
            titulo="Filtro inicial do catálogo"
            opcoes={FILTRO}
            valor={prefs.filtroInicial}
            onChange={(filtroInicial) => alterarPrefs({ filtroInicial })}
          />
          <p className="m-0 text-[15px] text-texto-suave">
            Vale ao abrir o catálogo sem escolher um filtro na URL.
          </p>
        </div>

        <div {...painel('plataformas')}>
          <ChipsPlataformas favoritas={favoritas} aviso={aviso} onAlternar={alternarFavorita} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-borda pt-4">
        <button
          type="button"
          onClick={restaurar}
          className="min-h-11 rounded-xl px-3 text-[16px] font-semibold text-texto-suave underline underline-offset-4 hover:text-texto"
        >
          Restaurar padrões
        </button>
        <button
          type="button"
          onClick={onConcluir}
          className="min-h-12 rounded-xl bg-destaque px-6 font-display text-[13px] font-extrabold uppercase tracking-[0.1em] text-fundo"
        >
          Concluído
        </button>
      </div>
    </div>
  );
}

/**
 * "Preferências do aparelho" (spec perfil, etapa 5): as cinco preferências da etapa 3 em abas, dentro
 * do `ModalDialog` (Esc, foco preso e volta à linha que abriu). Sem Salvar: cada escolha grava e
 * aplica na hora, e o próprio modal já usa o token `destaque`, então a cor nova aparece nele também.
 * O conteúdo só existe aberto, então cada abertura começa na aba Aparência.
 */
export function PreferenciasModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ModalDialog open={open} onClose={onClose} labelledBy="prefs-titulo">
      <Conteudo onConcluir={onClose} />
    </ModalDialog>
  );
}
