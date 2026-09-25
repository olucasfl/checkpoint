import { useState } from 'react';
import { FieldError } from '@/shared/components/form-parts';
import { PLATFORM_GROUPS } from '@/features/games/lib/platforms';
import { usePrefs } from '@/shared/hooks/use-prefs';
import {
  MAX_FAVORITAS,
  type Densidade,
  type Destaque,
  type Efeitos,
  type FiltroInicial,
} from '@/shared/lib/prefs/prefs';
import { alterarPrefs } from '@/shared/lib/prefs/prefs-store';
import { GrupoOpcoes, type Opcao } from './GrupoOpcoes';

/** A amostra é o próprio token da cor (sem hex): o mesmo que o `html[data-destaque]` usa. */
const amostra = (classe: string) => (
  <span aria-hidden="true" className={`size-4 shrink-0 rounded-full ${classe}`} />
);

const DESTAQUE: readonly Opcao<Destaque>[] = [
  { valor: 'magenta', rotulo: 'Magenta', antes: amostra('bg-magenta') },
  { valor: 'violeta', rotulo: 'Violeta', antes: amostra('bg-capa-6') },
  { valor: 'azul', rotulo: 'Azul', antes: amostra('bg-capa-1') },
  { valor: 'laranja', rotulo: 'Laranja', antes: amostra('bg-capa-3') },
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
  { valor: 'completos', rotulo: 'Completos' },
  { valor: 'reduzidos', rotulo: 'Reduzidos' },
];

export const AVISO_LIMITE_FAVORITAS = `Até ${MAX_FAVORITAS} favoritas`;

/**
 * "Preferências deste aparelho" do /perfil (spec perfil, etapa 3): cor de destaque, filtro inicial,
 * densidade, efeitos e plataformas favoritas. Mudam na hora, sem Salvar e sem nenhuma request: ficam
 * só neste navegador, por usuário (`shared/lib/prefs`).
 */
export function PreferenciasAparelho() {
  const prefs = usePrefs();
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

  return (
    <section
      aria-labelledby="perfil-prefs"
      className="flex flex-col gap-5 rounded-md border border-borda bg-painel p-5 md:p-6"
    >
      <div>
        <h2
          id="perfil-prefs"
          className="m-0 font-display text-[15px] font-extrabold uppercase tracking-[0.14em]"
        >
          Preferências deste aparelho
        </h2>
        <p className="m-0 text-[15px] text-texto-suave">Salvas só neste aparelho</p>
      </div>

      <GrupoOpcoes
        id="pref-destaque"
        titulo="Cor de destaque"
        opcoes={DESTAQUE}
        valor={prefs.destaque}
        onChange={(destaque) => alterarPrefs({ destaque })}
      />
      <GrupoOpcoes
        id="pref-filtro"
        titulo="Filtro inicial do catálogo"
        opcoes={FILTRO}
        valor={prefs.filtroInicial}
        onChange={(filtroInicial) => alterarPrefs({ filtroInicial })}
      />
      <GrupoOpcoes
        id="pref-densidade"
        titulo="Densidade da lista"
        opcoes={DENSIDADE}
        valor={prefs.densidade}
        onChange={(densidade) => alterarPrefs({ densidade })}
      />
      <GrupoOpcoes
        id="pref-efeitos"
        titulo="Efeitos visuais"
        opcoes={EFEITOS}
        valor={prefs.efeitos}
        onChange={(efeitos) => alterarPrefs({ efeitos })}
      />

      <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
        <legend className="p-0 text-[16px] font-semibold">
          Plataformas favoritas{' '}
          <span className="font-normal text-texto-suave">
            ({favoritas.length} de {MAX_FAVORITAS})
          </span>
        </legend>
        <p className="m-0 text-[15px] text-texto-suave">
          Aparecem primeiro na escolha da plataforma, ao cadastrar um jogo.
        </p>
        <FieldError id="pref-favoritas-aviso" message={aviso} />
        {PLATFORM_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <div className="text-sm font-bold uppercase tracking-[0.22em] text-texto-suave">
              {group.label}
            </div>
            <div className="grid grid-cols-1 gap-x-3 min-[380px]:grid-cols-2">
              {group.platforms.map((plataforma) => {
                const marcada = favoritas.includes(plataforma);
                return (
                  <label
                    key={plataforma}
                    className="flex min-h-11 cursor-pointer items-center gap-3 text-[16px]"
                  >
                    <input
                      type="checkbox"
                      checked={marcada}
                      onChange={(event) => alternarFavorita(plataforma, event.target.checked)}
                      className="size-5 shrink-0 accent-ciano"
                    />
                    {plataforma}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </fieldset>
    </section>
  );
}
