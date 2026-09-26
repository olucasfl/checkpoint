import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { GAME_COVER_MIME_TYPES } from '@checkpoint/shared';
import { Icon } from '@/shared/components/Icon';
import { validateCoverFile } from '../lib/cover-file';
import { Field, FieldError, LABEL } from '@/shared/components/form-parts';
import { GameCover } from './GameCover';

interface CoverFieldProps {
  titulo: string;
  /** Capa que o jogo já tem no servidor (ou `null`). */
  currentUrl: string | null;
  file: File | null;
  /** A capa atual foi marcada para sair ao salvar. */
  removing: boolean;
  /** Capa oficial do item da Steam escolhido: só PRÉVIA (não é salva com o jogo). */
  oficialUrl?: string | null;
  error: string | undefined;
  onPick: (file: File) => void;
  onProblem: (message: string) => void;
  onRemove: () => void;
}

const BTN =
  'flex min-h-11 items-center gap-1.5 rounded-full border border-borda-controle px-4 font-display text-sm font-bold transition-colors enabled:hover:bg-painel-3 disabled:border-apagado-2 disabled:opacity-60';

/**
 * Capa do formulário: preview da imagem escolhida ANTES de salvar (nada é enviado até Salvar),
 * escolher arquivo e remover. O tipo e o tamanho são conferidos aqui por comodidade; a API decide.
 */
export function CoverField({
  titulo,
  currentUrl,
  file,
  removing,
  oficialUrl = null,
  error,
  onPick,
  onProblem,
  onRemove,
}: CoverFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0];
    event.target.value = '';
    if (!picked) {
      return;
    }
    const problem = validateCoverFile(picked);
    if (problem) {
      onProblem(problem);
      return;
    }
    onPick(picked);
  }

  const keptUrl = removing ? null : currentUrl;
  const canRemove = file !== null || keptUrl !== null;
  const mostrandoOficial = file === null && keptUrl === null && oficialUrl !== null;

  return (
    <Field>
      <div className={LABEL}>
        Capa <small className="text-sm normal-case tracking-[0.06em]">(opcional)</small>
      </div>

      <div
        className={`flex items-center gap-4 rounded-2xl border border-dashed p-3.5 ${
          error ? 'border-erro' : 'border-borda-controle'
        }`}
      >
        {previewUrl ? (
          <div
            className="aspect-[3/4] w-14 shrink-0 overflow-hidden rounded-lg"
            data-cover="preview"
          >
            <img
              src={previewUrl}
              alt="Prévia da capa selecionada"
              className="block size-full object-cover"
            />
          </div>
        ) : (
          <GameCover titulo={titulo} capaUrl={keptUrl ?? oficialUrl} variant="preview" />
        )}

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BTN} onClick={() => inputRef.current?.click()}>
              <Icon name="upload" size={18} />
              Enviar
            </button>
            <button type="button" className={BTN} disabled={!canRemove} onClick={onRemove}>
              <Icon name="hide_image" size={18} />
              Remover capa
            </button>
          </div>
          {mostrandoOficial && (
            <span className="text-sm font-semibold">Prévia da capa oficial da Steam</span>
          )}
          <span className="text-sm text-texto-suave">
            Envie um arquivo (JPEG, PNG ou WebP, até 2 MB) para usar a sua.
          </span>
          <span className="text-sm text-texto-suave">
            A capa aparece em pé (3:4); imagens de outra proporção são cortadas no centro.
          </span>
        </div>

        <input
          ref={inputRef}
          type="file"
          hidden
          aria-label="Arquivo da capa"
          accept={GAME_COVER_MIME_TYPES.join(',')}
          onChange={handleChange}
        />
      </div>

      <FieldError id="f-capa-err" message={error} />
    </Field>
  );
}
