import { useState, type FormEvent } from 'react';
import { type Game, type GameStatus } from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';
import { useSaveGame } from '../api/use-games';
import { describeError, forForm, type FormError } from '../lib/api-error';
import {
  EMPTY_FORM_VALUES,
  valuesFromGame,
  withStatus,
  type GameFormValues,
} from '../lib/form-values';
import { type CoverChange } from '../lib/save-game';
import { CoverField } from './CoverField';
import { Field, FieldError, inputClass, LABEL } from '@/shared/components/form-parts';
import { PlatformField } from './PlatformField';
import { RatingField } from './RatingField';
import { StatusPicker } from './StatusPicker';

interface GameFormProps {
  /** Jogo em edição; ausente = jogo novo. */
  game?: Game;
  /** Salvou tudo (jogo e capa): o diálogo pode fechar. */
  onDone: () => void;
  onCancel: () => void;
}

const NO_ERROR: FormError = { message: '', fields: {} };

/**
 * Formulário de criar/editar (o mesmo componente, aberto no diálogo). Salva o jogo primeiro e só
 * depois a capa. Se o jogo salvou e a capa falhou, o diálogo continua aberto, agora editando AQUELE
 * jogo (o próximo Salvar é PATCH, não POST, e não gera 409) e o erro aparece no campo da capa.
 */
export function GameForm({ game, onDone, onCancel }: GameFormProps) {
  const [saved, setSaved] = useState<Game | undefined>(game);
  const [values, setValues] = useState<GameFormValues>(
    game ? valuesFromGame(game) : EMPTY_FORM_VALUES,
  );
  const [file, setFile] = useState<File | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<FormError>(NO_ERROR);
  const mutation = useSaveGame();

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
    clearError('nota');
  }

  function removeCover() {
    if (file) {
      setFile(null);
    } else {
      setRemoving(true);
    }
    clearError('capa');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mutation.isPending) {
      return;
    }
    setError(NO_ERROR);

    if (values.titulo.trim() === '') {
      setError({ message: '', fields: { titulo: 'Informe o título' } });
      return;
    }

    const cover: CoverChange = file
      ? { kind: 'upload', file }
      : removing && saved?.capaUrl
        ? { kind: 'remove' }
        : { kind: 'keep' };

    try {
      const result = await mutation.mutateAsync({ gameId: saved?.id, values, cover });
      if (result.coverError) {
        // O jogo FOI salvo: continua aberto, editando esse jogo, com o erro na área da capa.
        setSaved(result.game);
        setError(forForm(result.coverError));
        return;
      }
      onDone();
    } catch (failure) {
      setError(forForm(describeError(failure)));
    }
  }

  const generalMessage = Object.keys(fields).length === 0 ? error.message : '';

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h2
          id="game-dialog-title"
          className="m-0 flex items-center gap-2.5 font-display text-xl font-extrabold tracking-[0.12em]"
        >
          <Icon
            name={editing ? 'edit_square' : 'add_box'}
            size={26}
            filled
            className="text-magenta"
          />
          {editing ? 'EDITAR JOGO' : 'NOVO JOGO'}
        </h2>
        <button
          type="button"
          aria-label="Fechar"
          onClick={onCancel}
          className="grid size-11 place-items-center rounded-[4px] text-texto-suave transition-colors hover:bg-acao-hover hover:text-ciano"
        >
          <Icon name="close" size={24} />
        </button>
      </div>

      {generalMessage && <FieldError id="form-error" message={generalMessage} />}

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
      />

      <div className="flex flex-col gap-2">
        <StatusPicker value={values.status} onChange={setStatus} />
        <FieldError id="f-status-err" message={fields.status} />
      </div>

      <RatingField
        status={values.status}
        value={values.nota}
        error={fields.nota}
        onChange={(nota) => {
          setValues((current) => ({ ...current, nota }));
          clearError('nota');
        }}
      />

      <CoverField
        titulo={values.titulo}
        currentUrl={saved?.capaUrl ?? null}
        file={file}
        removing={removing}
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

      <div className="sheet-footer sticky bottom-0 -mx-6 -mb-6 flex justify-end gap-2.5 border-t border-borda bg-painel px-6 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-12 rounded-[4px] border border-borda-controle px-5 font-display text-[13px] font-semibold tracking-[0.1em] hover:bg-acao-hover"
        >
          CANCELAR
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="glow-primary min-h-12 rounded-[4px] bg-magenta px-[22px] font-display text-[13px] font-extrabold tracking-[0.1em] text-fundo disabled:opacity-70"
        >
          {mutation.isPending ? 'SALVANDO…' : 'SALVAR'}
        </button>
      </div>
    </form>
  );
}
