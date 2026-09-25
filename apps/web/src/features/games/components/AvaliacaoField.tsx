import type { ChangeEvent, PointerEvent } from 'react';
import {
  GAME_RATING_CRITERIA,
  GAME_RATING_MAX,
  GAME_RATING_MIN,
  GAME_RATING_STEP,
  type GameRatingKey,
} from '@checkpoint/shared';
import { FieldError } from '@/shared/components/form-parts';
import { type RatingTexts } from '../lib/form-values';
import {
  formatRating,
  parseRatingInput,
  ratingErrorText,
  ratingToInput,
} from '../lib/rating-input';

interface AvaliacaoFieldProps {
  notas: RatingTexts;
  /** Erro de cada critério (do envio, da API ou da digitação). */
  errors: Partial<Record<GameRatingKey, string>>;
  /** Erro da seção inteira (`fields.notas`: Zerado sem nenhum critério). */
  sectionError: string | undefined;
  /** A média ao vivo do que já foi preenchido; `null` = "—". */
  media: number | null;
  onChange: (chave: GameRatingKey, texto: string) => void;
}

interface CriterioProps {
  chave: GameRatingKey;
  rotulo: string;
  descricao: string;
  texto: string;
  error: string | undefined;
  onChange: (texto: string) => void;
}

const CONTROLE =
  'min-h-11 rounded-[4px] border bg-fundo px-2.5 font-corpo text-[19px] font-semibold';

/**
 * Um critério, com o slider e o campo lendo o MESMO texto: assim não há dois estados para dessincronizar, e o
 * que a API recebe é sempre o que está no campo.
 *
 * "Sem nota" (texto vazio) NÃO é 0, porque 0 é uma nota e entra na média. O slider nativo não tem "vazio", e
 * seu `change` não dispara se o dedo solta onde ele já está (o 0 de "sem nota"): sem o `pointerup`, não
 * haveria como dar nota 0 por ele. O erro de digitação aparece na hora (e não só ao enviar) porque o campo é
 * texto livre; o da API, que só chega no envio, tem prioridade quando existe.
 */
function Criterio({ chave, rotulo, descricao, texto, error, onChange }: CriterioProps) {
  const parsed = parseRatingInput(texto);
  const vazio = parsed.kind === 'vazio';
  // O erro de digitação aparece na hora (fora de 0 a 10, ou casa demais); o da API (`error`) vem do envio.
  const shownError = error ?? (parsed.kind === 'invalido' ? ratingErrorText(rotulo) : undefined);
  const sliderValue = parsed.kind === 'ok' ? parsed.valor : GAME_RATING_MIN;

  function fromSlider(event: ChangeEvent<HTMLInputElement>) {
    onChange(ratingToInput(Number(event.target.value)));
  }

  // O `change` do range não dispara se o dedo solta no ponto onde o slider já estava (o 0 de "sem nota"):
  // sem isto, não haveria como dar nota 0 pelo slider.
  function commitIfEmpty(event: PointerEvent<HTMLInputElement>) {
    if (vazio) {
      onChange(ratingToInput(Number(event.currentTarget.value)));
    }
  }

  const id = `f-nota-${chave}`;

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-painel-2 p-3" data-criterio={chave}>
      <div className="flex flex-col">
        <label htmlFor={id} className="text-[17px] font-semibold">
          {rotulo}
        </label>
        <span id={`${id}-desc`} className="text-[15px] text-texto-suave">
          {descricao}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <input
          type="range"
          aria-label={`${rotulo}, controle deslizante`}
          aria-valuetext={vazio ? 'sem nota' : formatRating(sliderValue)}
          min={GAME_RATING_MIN}
          max={GAME_RATING_MAX}
          step={GAME_RATING_STEP}
          value={sliderValue}
          data-vazio={vazio ? 'true' : undefined}
          onChange={fromSlider}
          onPointerUp={commitIfEmpty}
          className={`h-11 min-w-0 flex-1 accent-destaque ${vazio ? 'opacity-40' : ''}`}
        />
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="—"
          value={texto}
          aria-invalid={shownError ? true : undefined}
          aria-describedby={shownError ? `${id}-err` : `${id}-desc`}
          onChange={(event) => onChange(event.target.value)}
          className={`${CONTROLE} w-[72px] text-center ${shownError ? 'border-erro' : 'border-borda-controle'}`}
        />
        <button
          type="button"
          aria-label={`Limpar ${rotulo}`}
          disabled={texto === ''}
          onClick={() => onChange('')}
          className="min-h-11 min-w-11 rounded-[4px] px-2 text-[15px] font-semibold text-texto-suave underline underline-offset-4 hover:text-ciano disabled:cursor-default disabled:no-underline disabled:opacity-40"
        >
          Limpar
        </button>
      </div>

      <FieldError id={`${id}-err`} message={shownError} />
    </div>
  );
}

/**
 * A seção Avaliação do formulário. A nota geral NUNCA é digitada: mostrar a média ao vivo, calculada pela mesma
 * `notaMedia` que a API usa, evita que a tela prometa um número e o servidor devolva outro. Todos os critérios
 * são opcionais; quem exige "ao menos um" para um Zerado é a API (o erro volta em `sectionError`), porque só
 * ela sabe se o valor mudou em relação ao gravado (os jogos Zerado antigos não têm nota e continuam editáveis).
 */
export function AvaliacaoField({
  notas,
  errors,
  sectionError,
  media,
  onChange,
}: AvaliacaoFieldProps) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
      <legend className="mb-1 p-0 font-display text-[13px] font-extrabold uppercase tracking-[0.16em]">
        Avaliação
      </legend>
      <p className="m-0 text-[15px] text-texto-suave">
        Todos os critérios são opcionais, de {GAME_RATING_MIN} a {GAME_RATING_MAX} (aceita casas
        decimais, ex.: 8,7).
      </p>

      {GAME_RATING_CRITERIA.map((criterio) => (
        <Criterio
          key={criterio.chave}
          chave={criterio.chave}
          rotulo={criterio.rotulo}
          descricao={criterio.descricao}
          texto={notas[criterio.chave]}
          error={errors[criterio.chave]}
          onChange={(texto) => onChange(criterio.chave, texto)}
        />
      ))}

      <p aria-live="polite" data-media className="m-0 flex items-baseline gap-2 text-[17px]">
        <span className="font-semibold">Média</span>
        <span className="font-corpo text-2xl font-bold tabular-nums">
          {media === null ? '—' : formatRating(media)}
        </span>
        {media !== null && <span className="text-texto-suave">/{GAME_RATING_MAX}</span>}
      </p>

      <FieldError id="f-notas-err" message={sectionError} />
    </fieldset>
  );
}
