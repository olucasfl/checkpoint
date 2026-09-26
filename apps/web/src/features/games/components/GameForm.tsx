import { RotuloPendente } from '@/shared/components/RotuloPendente';
import { useState, type FormEvent } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import {
  GAME_RATING_KEYS,
  statusAllowsRating,
  type Game,
  type GameRatingKey,
  type GameStatus,
  type ItemBiblioteca,
} from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';
import { usePrefs } from '@/shared/hooks/use-prefs';
import { describeAuthError } from '@/features/auth/lib/auth-errors';
import { useTemContaSteam, useVincularJogo } from '@/features/integracoes/api/use-integracoes';
import { PROVEDOR_STEAM } from '@/features/integracoes/lib/provedores';
import { PlataformaMarca } from '@/shared/components/PlataformaMarca';
import { BibliotecaSteamDialog } from '@/features/integracoes/components/BibliotecaSteamDialog';
import { horasEMinutos } from '@/features/integracoes/lib/conquistas';
import {
  PLATAFORMA_PADRAO,
  precisaConfirmarPlataforma,
  statusSugerido,
  tituloDoItem,
} from '@/features/integracoes/lib/biblioteca';
import { useSaveGame } from '../api/use-games';
import { describeError, forForm, type FormError } from '../lib/api-error';
import {
  EMPTY_FORM_VALUES,
  hasRatingText,
  mediaOf,
  ratingErrors,
  valuesFromGame,
  withStatus,
  type GameFormValues,
} from '../lib/form-values';
import { type CoverChange } from '../lib/save-game';
import { AvaliacaoField } from './AvaliacaoField';
import { CoverField } from './CoverField';
import { DescricaoField } from './DescricaoField';
import { Field, FieldError, inputClass, LABEL } from '@/shared/components/form-parts';
import { PlatformField } from './PlatformField';
import { StatusPicker } from './StatusPicker';

/** O que o formulário devolve ao terminar: o jogo salvo e se foi criado (o formulário abriu sem jogo). */
export interface ResultadoDoSalvar {
  jogo: Game;
  criado: boolean;
}

interface GameFormProps {
  /** Jogo em edição; ausente = jogo novo. */
  game?: Game;
  /** Salvou tudo (jogo e capa): o diálogo pode fechar. Traz o jogo como ficou e se o salvar o CRIOU. */
  onDone: (resultado?: ResultadoDoSalvar) => void;
  onCancel: () => void;
  /** Jogo NOVO: a pessoa ligou um item da Steam a um jogo que já existia. Quem abriu leva ao jogo. */
  onLinkedExisting?: (jogoId: string) => void;
  /** Jogo novo aberto pelo "Adicionar" de uma prateleira: começa com o status dela. Sem isso, o padrão. */
  statusInicial?: GameStatus;
  /** Jogo NOVO que já nasce ligado a um item da Steam ("Ver e importar" do popup): título, plataforma e status vêm dele. */
  itemInicial?: ItemBiblioteca;
}

const NO_ERROR: FormError = { message: '', fields: {} };

const BOTAO_PEQUENO =
  'min-h-11 rounded-full border border-borda-controle px-4 font-display text-sm font-bold transition-colors hover:bg-painel-3';

/**
 * Formulário de criar/editar (o mesmo componente, aberto no diálogo). Salva o jogo primeiro e só
 * depois a capa. Se o jogo salvou e a capa falhou, o diálogo continua aberto, agora editando AQUELE
 * jogo (o próximo Salvar é PATCH, não POST, e não gera 409) e o erro aparece no campo da capa.
 */
export function GameForm({
  game,
  onDone,
  onCancel,
  onLinkedExisting,
  statusInicial,
  itemInicial,
}: GameFormProps) {
  const [saved, setSaved] = useState<Game | undefined>(game);
  const [values, setValues] = useState<GameFormValues>(
    game
      ? valuesFromGame(game)
      : itemInicial
        ? {
            ...EMPTY_FORM_VALUES,
            titulo: tituloDoItem(itemInicial.titulo),
            plataforma: PLATAFORMA_PADRAO,
            status: statusSugerido(itemInicial.minutosJogados),
          }
        : { ...EMPTY_FORM_VALUES, status: statusInicial ?? EMPTY_FORM_VALUES.status },
  );
  const [file, setFile] = useState<File | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<FormError>(NO_ERROR);
  const mutation = useSaveGame();
  const vincular = useVincularJogo(PROVEDOR_STEAM);
  const temContaSteam = useTemContaSteam();
  const noRouter = useInRouterContext();
  // O item da Steam escolhido em "Buscar na Steam" (só jogo novo). O vínculo só é gravado DEPOIS de o jogo ser
  // criado; a capa oficial dele é só prévia (o arquivo de capa continua sendo escolha da pessoa).
  const [ligacao, setLigacao] = useState<ItemBiblioteca | null>(
    game ? null : (itemInicial ?? null),
  );
  const [ligado, setLigado] = useState(false);
  const [erroLigacao, setErroLigacao] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [confirmandoPlataforma, setConfirmandoPlataforma] = useState(false);
  const { plataformasFavoritas } = usePrefs();

  const editing = saved !== undefined;
  const { fields } = error;

  function clearError(name: keyof FormError['fields']) {
    setError((current) => {
      const { [name]: _removed, ...rest } = current.fields;
      return { message: current.message, fields: rest };
    });
  }

  function setField<K extends 'titulo' | 'plataforma'>(name: K, value: string) {
    setValues((current) => ({ ...current, [name]: value }));
    clearError(name);
  }

  function setStatus(status: GameStatus) {
    setValues((current) => withStatus(current, status));
    clearError('status');
    clearError('notas');
    for (const chave of GAME_RATING_KEYS) {
      clearError(chave);
    }
  }

  function setRating(chave: GameRatingKey, texto: string) {
    setValues((current) => ({ ...current, notas: { ...current.notas, [chave]: texto } }));
    clearError(chave);
    clearError('notas');
  }

  function removeCover() {
    if (file) {
      setFile(null);
    } else {
      setRemoving(true);
    }
    clearError('capa');
  }

  function aplicarItem(item: ItemBiblioteca) {
    setValues((current) => ({
      ...current,
      titulo: tituloDoItem(item.titulo),
      plataforma: PLATAFORMA_PADRAO,
      status: statusSugerido(item.minutosJogados),
    }));
    clearError('titulo');
    clearError('plataforma');
    setLigacao(item);
    setLigado(false);
    setErroLigacao('');
    setBuscando(false);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void salvar(false);
  }

  async function salvar(plataformaConfirmada: boolean) {
    if (mutation.isPending || vincular.isPending) {
      return;
    }
    setError(NO_ERROR);
    setErroLigacao('');
    setConfirmandoPlataforma(false);

    // Avisa antes de enviar o que a API rejeitaria de qualquer jeito (título vazio, nota fora de 0 a 10 ou
    // com casa demais): nenhuma request sai enquanto houver erro de digitação.
    const local: FormError['fields'] = ratingErrors(values);
    if (values.titulo.trim() === '') {
      local.titulo = 'Informe o título';
    }
    if (Object.keys(local).length > 0) {
      setError({ message: '', fields: local });
      return;
    }

    // Ligar um jogo de outra plataforma a um item da Steam pede confirmação ANTES de criar qualquer coisa.
    if (
      ligacao &&
      !saved &&
      !plataformaConfirmada &&
      precisaConfirmarPlataforma(values.plataforma)
    ) {
      setConfirmandoPlataforma(true);
      return;
    }

    const cover: CoverChange = file
      ? { kind: 'upload', file }
      : removing && saved?.capaUrl
        ? { kind: 'remove' }
        : { kind: 'keep' };

    try {
      const result = await mutation.mutateAsync({ gameId: saved?.id, values, cover });
      // O jogo FOI salvo: dali em diante o formulário edita AQUELE jogo (o próximo Salvar é PATCH, sem 409).
      setSaved(result.game);
      let ligacaoOk = true;
      if (ligacao && !ligado) {
        try {
          await vincular.mutateAsync({ jogoId: result.game.id, idExterno: ligacao.idExterno });
          setLigado(true);
        } catch (failure) {
          // O PUT é idempotente para o mesmo item: o próximo Salvar reenvia a ligação sem dar 409.
          ligacaoOk = false;
          setErroLigacao(
            `O jogo foi salvo, mas não foi ligado à Steam. ${describeAuthError(failure).message} Toque em Salvar para tentar de novo.`,
          );
        }
      }
      if (result.coverError) {
        setError(forForm(result.coverError));
        return;
      }
      if (ligacaoOk) {
        onDone({ jogo: result.game, criado: !game });
      }
    } catch (failure) {
      setError(forForm(describeError(failure)));
    }
  }

  const generalMessage = Object.keys(fields).length === 0 ? error.message : '';
  const ratingFieldErrors: Partial<Record<GameRatingKey, string>> = {};
  for (const chave of GAME_RATING_KEYS) {
    ratingFieldErrors[chave] = fields[chave];
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-3">
        <h2
          id="game-dialog-title"
          className="m-0 flex items-center gap-2.5 font-display text-[26px] font-extrabold"
        >
          <Icon
            name={editing ? 'edit_square' : 'add_box'}
            size={28}
            filled
            className="text-destaque"
          />
          {editing ? 'Editar jogo' : 'Novo jogo'}
        </h2>
        <button
          type="button"
          aria-label="Fechar"
          onClick={onCancel}
          className="grid size-11 shrink-0 place-items-center rounded-full text-texto-suave transition-colors hover:bg-painel-3 hover:text-texto"
        >
          <Icon name="close" size={24} />
        </button>
      </div>

      {generalMessage && <FieldError id="form-error" message={generalMessage} />}

      {!editing && temContaSteam === true && (
        <div className="flex flex-col gap-2">
          {ligacao ? (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-painel-2 p-3.5">
              {ligacao.capaUrl && (
                // Só prévia (decorativa, sem `Referer`): a capa oficial NÃO é salva com o jogo.
                <img
                  src={ligacao.capaUrl}
                  alt=""
                  width={44}
                  height={58}
                  referrerPolicy="no-referrer"
                  className="h-[58px] w-11 shrink-0 rounded-lg bg-fundo object-cover"
                />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-start gap-1.5 text-[15px] font-bold [overflow-wrap:anywhere]">
                  <PlataformaMarca
                    provedor={PROVEDOR_STEAM}
                    variante="marcador"
                    tamanho="m"
                    decorativa
                    className="mt-0.5 shrink-0"
                  />
                  Ligado à Steam: «{ligacao.titulo}»
                </span>
                <span className="text-[13px] font-medium text-texto-suave">
                  {horasEMinutos(ligacao.minutosJogados)}. A capa oficial é só prévia.
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setBuscando(true)} className={BOTAO_PEQUENO}>
                  Trocar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLigacao(null);
                    setErroLigacao('');
                  }}
                  className={BOTAO_PEQUENO}
                >
                  Remover ligação
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setBuscando(true)}
              className="flex h-[52px] items-center justify-center gap-2 rounded-xl border-2 border-dashed border-destaque bg-destaque/10 px-4 font-display text-[15px] font-bold text-destaque transition-colors hover:bg-destaque/20"
            >
              <PlataformaMarca
                provedor={PROVEDOR_STEAM}
                variante="marcador"
                tamanho="m"
                decorativa
              />
              Buscar na Steam
            </button>
          )}
          <FieldError id="f-ligacao-err" message={erroLigacao} />
        </div>
      )}
      {!editing && temContaSteam === false && (
        <p className="m-0 text-[16px] text-texto-suave">
          {noRouter ? (
            <Link to="/perfil" className="font-semibold text-destaque underline">
              Vincule sua Steam no perfil
            </Link>
          ) : (
            'Vincule sua Steam no perfil'
          )}{' '}
          para buscar jogos da sua biblioteca.
        </p>
      )}
      {editing && erroLigacao && <FieldError id="f-ligacao-err" message={erroLigacao} />}

      <Field>
        <label htmlFor="f-titulo" className={LABEL}>
          Título
        </label>
        <input
          id="f-titulo"
          data-autofocus
          value={values.titulo}
          aria-invalid={fields.titulo ? true : undefined}
          aria-describedby={fields.titulo ? 'f-titulo-err' : undefined}
          onChange={(event) => setField('titulo', event.target.value)}
          className={inputClass(Boolean(fields.titulo))}
        />
        <FieldError id="f-titulo-err" message={fields.titulo} />
      </Field>

      <PlatformField
        value={values.plataforma}
        error={fields.plataforma}
        onChange={(value) => setField('plataforma', value)}
        favoritas={plataformasFavoritas}
      />

      <div className="flex flex-col gap-2">
        <StatusPicker value={values.status} onChange={setStatus} />
        <FieldError id="f-status-err" message={fields.status} />
      </div>

      {statusAllowsRating(values.status) ? (
        <AvaliacaoField
          notas={values.notas}
          errors={ratingFieldErrors}
          sectionError={fields.notas}
          media={mediaOf(values)}
          onChange={setRating}
        />
      ) : (
        hasRatingText(values) && (
          <p
            role="status"
            data-aviso-notas
            className="m-0 flex items-center gap-2 rounded-xl bg-painel-2 px-3.5 py-3 text-[16px] font-semibold text-ouro"
          >
            <Icon name="warning" size={20} filled />
            As notas preenchidas serão apagadas ao salvar como Quero jogar.
          </p>
        )
      )}

      <DescricaoField
        value={values.descricao}
        error={fields.descricao}
        onChange={(descricao) => {
          setValues((current) => ({ ...current, descricao }));
          clearError('descricao');
        }}
      />

      <CoverField
        titulo={values.titulo}
        currentUrl={saved?.capaUrl ?? null}
        file={file}
        removing={removing}
        oficialUrl={ligacao?.capaUrl ?? null}
        error={fields.capa}
        onPick={(picked) => {
          setFile(picked);
          setRemoving(false);
          clearError('capa');
        }}
        onProblem={(message) =>
          setError((current) => ({ ...current, fields: { ...current.fields, capa: message } }))
        }
        onRemove={removeCover}
      />

      {confirmandoPlataforma && (
        <div
          role="group"
          aria-label="Confirmar a plataforma"
          className="flex flex-col gap-3 rounded-2xl bg-painel-2 p-4"
        >
          <p className="m-0 text-[17px]">
            «{values.titulo.trim()}» é um jogo de {values.plataforma.trim()}. Ao ligá-lo à Steam, as
            horas e as conquistas mostradas serão as da Steam. A plataforma do jogo não muda.
          </p>
          <div className="flex flex-wrap justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setConfirmandoPlataforma(false)}
              className={BOTAO_PEQUENO}
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={() => void salvar(true)}
              className="min-h-11 rounded-full bg-destaque px-[18px] font-display text-[15px] font-extrabold text-fundo"
            >
              Salvar mesmo assim
            </button>
          </div>
        </div>
      )}

      <BibliotecaSteamDialog
        open={buscando}
        modo={{ tipo: 'novo' }}
        onClose={() => setBuscando(false)}
        onCriar={aplicarItem}
        onVinculado={(jogoId) => {
          setBuscando(false);
          if (onLinkedExisting) {
            onLinkedExisting(jogoId);
          } else {
            onDone();
          }
        }}
      />

      <div className="sheet-footer sticky bottom-0 -mx-6 -mb-6 flex justify-end gap-2.5 border-t border-borda bg-painel px-6 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="h-[52px] rounded-full border border-borda-controle px-6 font-display text-[15px] font-bold transition-colors hover:bg-painel-3"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="h-[52px] rounded-full bg-destaque px-8 font-display text-base font-extrabold text-fundo transition-transform hover:-translate-y-0.5 disabled:opacity-70"
        >
          <RotuloPendente pendente={mutation.isPending} normal="Salvar" ocupado="Salvando…" />
        </button>
      </div>
    </form>
  );
}
