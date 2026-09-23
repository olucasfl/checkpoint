import { GAME_COVER_MAX_BYTES, GAME_COVER_MIME_TYPES } from '@checkpoint/shared';

/** Mesmas mensagens da API (400 e 413): o usuário vê o mesmo texto com ou sem ida ao servidor. */
export const COVER_TYPE_ERROR = 'A capa deve ser uma imagem JPEG, PNG ou WebP';
export const COVER_SIZE_ERROR = 'A capa deve ter no máximo 2 MB';

/**
 * Pré-checagem no navegador, por comodidade (não gasta um envio à toa). A API continua sendo a
 * autoridade: ela confere o CONTEÚDO do arquivo, não o tipo que o navegador informa.
 */
export function validateCoverFile(file: { size: number; type: string }): string | null {
  if (!(GAME_COVER_MIME_TYPES as readonly string[]).includes(file.type)) {
    return COVER_TYPE_ERROR;
  }
  if (file.size > GAME_COVER_MAX_BYTES) {
    return COVER_SIZE_ERROR;
  }
  return null;
}
