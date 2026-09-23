import { GAME_COVER_FIELD } from '@checkpoint/shared';

/** Mensagens literais da capa (spec catalogo-jogos, "Capa"). Todas vão em `fields.arquivo`. */
export const COVER_INVALID_TYPE = 'A capa deve ser uma imagem JPEG, PNG ou WebP';
export const COVER_TOO_LARGE = 'A capa deve ter no máximo 2 MB';
export const COVER_STORAGE_FAILURE = 'Falha ao acessar o armazenamento de capas';
export const COVER_MISSING = `Envie a capa no campo "${GAME_COVER_FIELD}"`;
