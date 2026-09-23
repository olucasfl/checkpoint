import { type GameCoverMimeType } from '@checkpoint/shared';

export interface DetectedImage {
  mime: GameCoverMimeType;
  /** Extensão do objeto no bucket, decidida pela assinatura e nunca pelo nome do arquivo enviado. */
  extension: 'jpg' | 'png' | 'webp';
}

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(buffer: Buffer, signature: number[], offset = 0): boolean {
  return (
    buffer.length >= offset + signature.length &&
    signature.every((byte, index) => buffer[offset + index] === byte)
  );
}

/**
 * Identifica JPEG, PNG e WebP pelos primeiros bytes do arquivo (magic bytes). O `Content-Type` e o
 * nome do arquivo vêm do cliente e podem mentir: um texto chamado `falso.png` não passa por aqui.
 * Devolve `null` para qualquer outra coisa (GIF, SVG, PDF, arquivo vazio ou truncado).
 */
export function detectImageType(buffer: Buffer): DetectedImage | null {
  if (startsWith(buffer, JPEG)) {
    return { mime: 'image/jpeg', extension: 'jpg' };
  }
  if (startsWith(buffer, PNG)) {
    return { mime: 'image/png', extension: 'png' };
  }
  // WebP é um contêiner RIFF: "RIFF" + 4 bytes de tamanho + "WEBP".
  if (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return { mime: 'image/webp', extension: 'webp' };
  }
  return null;
}
