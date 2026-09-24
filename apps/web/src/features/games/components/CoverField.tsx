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
  error: string | undefined;
  onPick: (file: File) => void;
  onProblem: (message: string) => void;
  onRemove: () => void;
}

const BTN =
  'flex min-h-12 items-center gap-1.5 rounded-[4px] border border-borda-controle px-4 font-display text-[13px] font-semibold tracking-[0.1em] enabled:hover:bg-acao-hover disabled:border-apagado-2 disabled:opacity-60';

/**
 * Capa do formulário: preview da imagem escolhida ANTES de salvar (nada é enviado até Salvar),
 * escolher arquivo e remover. O tipo e o tamanho são conferidos aqui por comodidade; a API decide.
 */
export function CoverField({
  titulo,
  currentUrl,
  file,
  removing,
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

  return (
    <Field>
      <div className={LABEL}>
        Capa <small className="text-sm normal-case tracking-[0.06em]">(opcional)</small>
      </div>

      <div
        className={`flex items-center gap-4 rounded-[4px] border border-dashed p-3 ${
          error ? 'border-erro' : 'border-borda-controle'
        }`}
      >
        {previewUrl ? (
          <div className="size-24 shrink-0 overflow-hidden rounded-[4px]" data-cover="preview">
            <img
              src={previewUrl}
              alt="Prévia da capa selecionada"
              className="block size-full object-cover"
            />
          </div>
        ) : (
          <GameCover titulo={titulo} capaUrl={keptUrl} variant="preview" />
        )}

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BTN} onClick={() => inputRef.current?.click()}>
              <Icon name="upload" size={18} />
              ESCOLHER IMAGEM
            </button>
            <button type="button" className={BTN} disabled={!canRemove} onClick={onRemove}>
              <Icon name="hide_image" size={18} />
              REMOVER CAPA
            </button>
          </div>
          <span className="text-[15px] text-texto-suave">JPEG, PNG ou WebP, até 2 MB</span>
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
