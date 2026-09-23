import { describe, expect, it } from 'vitest';
import { COVER_SIZE_ERROR, COVER_TYPE_ERROR, validateCoverFile } from './cover-file';

const TWO_MB = 2 * 1024 * 1024;

describe('validateCoverFile — pré-checagem sem request (CA-77)', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('aceita %s pequeno', (type) => {
    expect(validateCoverFile({ type, size: 200_000 })).toBeNull();
  });

  it('aceita exatamente 2 MB', () => {
    expect(validateCoverFile({ type: 'image/png', size: TWO_MB })).toBeNull();
  });

  it('rejeita 2 MB + 1 byte e um PNG de 3 MB com a mensagem de tamanho', () => {
    expect(validateCoverFile({ type: 'image/png', size: TWO_MB + 1 })).toBe(COVER_SIZE_ERROR);
    expect(validateCoverFile({ type: 'image/png', size: 3 * 1024 * 1024 })).toBe(COVER_SIZE_ERROR);
  });

  it.each(['image/gif', 'image/svg+xml', 'application/pdf', 'text/plain', ''])(
    'rejeita o tipo %j com a mensagem de tipo',
    (type) => {
      expect(validateCoverFile({ type, size: 1000 })).toBe(COVER_TYPE_ERROR);
    },
  );

  it('o tipo é conferido antes do tamanho', () => {
    expect(validateCoverFile({ type: 'image/gif', size: 3 * 1024 * 1024 })).toBe(COVER_TYPE_ERROR);
  });

  it('usa as mesmas mensagens da API', () => {
    expect(COVER_TYPE_ERROR).toBe('A capa deve ser uma imagem JPEG, PNG ou WebP');
    expect(COVER_SIZE_ERROR).toBe('A capa deve ter no máximo 2 MB');
  });
});
