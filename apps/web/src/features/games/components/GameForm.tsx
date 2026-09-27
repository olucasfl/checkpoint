import { RotuloPendente } from '@/shared/components/RotuloPendente';
import { useState, type FormEvent } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import {
  GAME_RATING_KEYS,
  PLATAFORMAS,
  statusAllowsRating,
  type Game,
  type GameRatingKey,
  type GameStatus,
  type ItemBiblioteca,
  type Provedor,
} from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';
import { usePrefs } from '@/shared/hooks/use-prefs';
import { describeAuthError } from '@/features/auth/lib/auth-errors';
import {
  usePlataformasComBiblioteca,
  useVincularJogoEm,
} from '@/features/integracoes/api/use-integracoes';
import { PlataformaMarca } from '@/shared/components/PlataformaMarca';
import { BibliotecaPlataformaDialog } from '@/features/integracoes/components/BibliotecaPlataformaDialog';
import { horasEMinutos } from '@/features/integracoes/lib/conquistas';
import {
  plataformaDoNovoJogo,
  precisaConfirmarPlataforma,
  statusSugerido,
  tituloDoItem,
} from '@/features/integracoes/lib/biblioteca';
import {
  dePlataforma,
  naPlataforma,
  textoDaConfirmacaoDePlataforma,
} from '@/features/integracoes/lib/plataforma-texto';
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
  /** Jogo NOVO: a pessoa ligou um item de uma plataforma (Steam, PlayStation…) a um jogo que já existia. Quem abriu leva ao jogo. */
  onLinkedExisting?: (jogoId: string) => void;
  /** Jogo novo aberto pelo "Adicionar" de uma prateleira: começa com o status dela. Sem isso, o padrão. */
  statusInicial?: GameStatus;
  /** Jogo NOVO que já nasce ligado a um item da plataforma `provedorInicial` ("Ver e importar" do popup): título, plataforma e status vêm dele. */
  itemInicial?: ItemBiblioteca;
  provedorInicial?: Provedor;
}

/** Os itens da biblioteca escolhidos em "Buscar na …" (no máximo um por plataforma). */
type Ligacoes = Partial<Record<Provedor, ItemBiblioteca>>;

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
  provedorInicial,
}: GameFormProps) {
  const [saved, setSaved] = useState<Game | undefined>(game);
  const [values, setValues] = useState<GameFormValues>(
    game
      ? valuesFromGame(game)
      : itemInicial
        ? {
            ...EMPTY_FORM_VALUES,
            titulo: tituloDoItem(itemInicial.titulo),
            plataforma: provedorInicial
              ? plataformaDoNovoJogo(itemInicial, PLATAFORMAS[provedorInicial])
              : '',
            status: statusSugerido(itemInicial.minutosJogados),
          }
        : { ...EMPTY_FORM_VALUES, status: statusInicial ?? EMPTY_FORM_VALUES.status },
  );
  const [file, setFile] = useState<File | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<FormError>(NO_ERROR);
  const mutation = useSaveGame();
  const vincular = useVincularJogoEm();
  const plataformasDaBiblioteca = usePlataformasComBiblioteca();
  const noRouter = useInRouterContext();
  // Os itens escolhidos em "Buscar na …" (só jogo novo, um por plataforma). O vínculo só é gravado DEPOIS de o jogo ser
  // criado; a capa oficial do primeiro que tiver é só prévia (o arquivo de capa continua sendo escolha da pessoa).
  const [ligacoes, setLigacoes] = useState<Ligacoes>(
    game || !itemInicial || !provedorInicial ? {} : { [provedorInicial]: itemInicial },
  );
  const [ligados, setLigados] = useState<Provedor[]>([]);
  const [erroLigacao, setErroLigacao] = useState('');
  const [buscando, setBuscando] = useState<Provedor | null>(null);
  const [confirmandoPlataforma, setConfirmandoPlataforma] = useState<Provedor | null>(null);
  const ligacoesEscolhidas = (Object.keys(ligacoes) as Provedor[]).filter(
    (provedor) => ligacoes[provedor] !== undefined,
  );
  // A capa oficial de prévia é a da primeira plataforma escolhida que tiver uma.
  const provedorDaCapa = ligacoesEscolhidas.find((provedor) => ligacoes[provedor]?.capaUrl);
  const capaOficial = provedorDaCapa ? (ligacoes[provedorDaCapa]?.capaUrl ?? null) : null;
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

  function aplicarItem(provedor: Provedor, item: ItemBiblioteca) {
    // Com o item de OUTRA plataforma já escolhido, o título, a plataforma e o status ficam como estão (o primeiro manda).
    const outraJaEscolhida = ligacoesEscolhidas.some((escolhida) => escolhida !== provedor);
    if (!outraJaEscolhida) {
      setValues((current) => ({
        ...current,
        titulo: tituloDoItem(item.titulo),
        plataforma: plataformaDoNovoJogo(item, PLATAFORMAS[provedor]),
        status: statusSugerido(item.minutosJogados),
      }));
      clearError('titulo');
      clearError('plataforma');
    }
    setLigacoes((atuais) => ({ ...atuais, [provedor]: item }));
    setLigados((atuais) => atuais.filter((ligado) => ligado !== provedor));
    setErroLigacao('');
    setBuscando(null);
  }

  function removerLigacao(provedor: Provedor) {
    setLigacoes((atuais) => {
      const { [provedor]: _removida, ...resto } = atuais;
      return resto;
    });
    setErroLigacao('');
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
    setConfirmandoPlataforma(null);

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

    // Ligar um jogo de outra plataforma a um item pede confirmação ANTES de criar qualquer coisa.
    const aConfirmar = ligacoesEscolhidas.find((provedor) =>
      precisaConfirmarPlataforma(values.plataforma, PLATAFORMAS[provedor]),
    );
    if (aConfirmar && !saved && !plataformaConfirmada) {
      setConfirmandoPlataforma(aConfirmar);
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
      for (const provedor of ligacoesEscolhidas) {
        const item = ligacoes[provedor];
        if (!item || ligados.includes(provedor)) {
          continue;
        }
        try {
          await vincular.mutateAsync({
            provedor,
            jogoId: result.game.id,
            idExterno: item.idExterno,
          });
          setLigados((atuais) => [...atuais, provedor]);
        } catch (failure) {
          // O PUT é idempotente para o mesmo item: o próximo Salvar reenvia a ligação sem dar 409.
          ligacaoOk = false;
          setErroLigacao(
            `O jogo foi salvo, mas não foi ligado ${PLATAFORMAS[provedor].ligadoA}. ${describeAuthError(failure).message} Toque em Salvar para tentar de novo.`,
          );
          break;
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

      {!editing && plataformasDaBiblioteca !== undefined && plataformasDaBiblioteca.length > 0 && (
        <div className="flex flex-col gap-2">
          {plataformasDaBiblioteca.map((plataforma) => {
            const provedor = plataforma.id as Provedor;
            const ligacao = ligacoes[provedor];
            return ligacao ? (
              <div
                key={plataforma.id}
                className="flex flex-wrap items-center gap-3 rounded-2xl bg-painel-2 p-3.5"
              >
                {ligacao.capaUrl && (
                  // Só prévia (decorativa, sem `Referer`): a capa oficial NÃO é salva com o jogo.
                  <img
                    src={ligacao.capaUrl}
                    alt=""
                    width={44}
                    height={plataforma.capaNaBusca === 'quadrada' ? 44 : 58}
                    referrerPolicy="no-referrer"
                    className={`${plataforma.capaNaBusca === 'quadrada' ? 'h-11' : 'h-[58px]'} w-11 shrink-0 rounded-lg bg-fundo object-cover`}
                  />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-start gap-1.5 text-[15px] font-bold [overflow-wrap:anywhere]">
                    <PlataformaMarca
                      provedor={provedor}
                      variante="marcador"
                      tamanho="m"
                      decorativa
                      className="mt-0.5 shrink-0"
                    />
                    Ligado {plataforma.ligadoA}: «{ligacao.titulo}»
                  </span>
                  <span className="text-[13px] font-medium text-texto-suave">
                    {horasEMinutos(ligacao.minutosJogados)}. A capa oficial é só prévia.
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setBuscando(provedor)}
                    className={BOTAO_PEQUENO}
                  >
                    Trocar
                  </button>
                  <button
                    type="button"
                    onClick={() => removerLigacao(provedor)}
                    className={BOTAO_PEQUENO}
                  >
                    Remover ligação
                  </button>
                </div>
              </div>
            ) : (
              <button
                key={plataforma.id}
                type="button"
                onClick={() => setBuscando(provedor)}
                className="flex h-[52px] items-center justify-center gap-2 rounded-xl border-2 border-dashed border-destaque bg-destaque/10 px-4 font-display text-[15px] font-bold text-destaque transition-colors hover:bg-destaque/20"
              >
                <PlataformaMarca provedor={provedor} variante="marcador" tamanho="m" decorativa />
                Buscar {naPlataforma(plataforma)}
              </button>
            );
          })}
          <FieldError id="f-ligacao-err" message={erroLigacao} />
        </div>
      )}
      {!editing &&
        plataformasDaBiblioteca !== undefined &&
        plataformasDaBiblioteca.length === 0 && (
          <p className="m-0 text-[16px] text-texto-suave">
            {noRouter ? (
              <Link to="/perfil" className="font-semibold text-destaque underline">
                Vincule sua conta no perfil
              </Link>
            ) : (
              'Vincule sua conta no perfil'
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
        oficialUrl={capaOficial}
        oficialDe={provedorDaCapa ? dePlataforma(PLATAFORMAS[provedorDaCapa]) : undefined}
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

      {confirmandoPlataforma !== null && (
        <div
          role="group"
          aria-label="Confirmar a plataforma"
          className="flex flex-col gap-3 rounded-2xl bg-painel-2 p-4"
        >
          <p className="m-0 text-[17px]">
            «{values.titulo.trim()}» é um jogo de {values.plataforma.trim()}. Ao ligá-lo{' '}
            {PLATAFORMAS[confirmandoPlataforma].ligadoA},{' '}
            {textoDaConfirmacaoDePlataforma(PLATAFORMAS[confirmandoPlataforma])}. A plataforma do
            jogo não muda.
          </p>
          <div className="flex flex-wrap justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setConfirmandoPlataforma(null)}
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

      {(plataformasDaBiblioteca ?? []).map((plataforma) => (
        <BibliotecaPlataformaDialog
          key={plataforma.id}
          provedor={plataforma.id as Provedor}
          open={buscando === plataforma.id}
          modo={{ tipo: 'novo' }}
          onClose={() => setBuscando(null)}
          onCriar={(item) => aplicarItem(plataforma.id as Provedor, item)}
          onVinculado={(jogoId) => {
            setBuscando(null);
            if (onLinkedExisting) {
              onLinkedExisting(jogoId);
            } else {
              onDone();
            }
          }}
        />
      ))}

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
