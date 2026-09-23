import { detectImageType } from './image-signature';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0, 0, 0]),
  Buffer.from('WEBP'),
]);

describe('detectImageType', () => {
  it('reconhece PNG (CA-53)', () => {
    expect(detectImageType(PNG)).toEqual({ mime: 'image/png', extension: 'png' });
  });

  it('reconhece JPEG e usa a extensão jpg (CA-54)', () => {
    expect(detectImageType(JPEG)).toEqual({ mime: 'image/jpeg', extension: 'jpg' });
  });

  it('reconhece WebP (CA-54)', () => {
    expect(detectImageType(WEBP)).toEqual({ mime: 'image/webp', extension: 'webp' });
  });

  it.each([
    ['texto', Buffer.from('isto é só um texto chamado falso.png')],
    ['GIF', Buffer.from('GIF89a\x01\x00\x01\x00')],
    ['SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['PDF', Buffer.from('%PDF-1.7\n')],
    ['buffer vazio', Buffer.alloc(0)],
    ['PNG truncado no meio da assinatura', PNG.subarray(0, 5)],
    ['JPEG truncado', JPEG.subarray(0, 2)],
    [
      'RIFF que não é WebP (WAV)',
      Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]),
    ],
    ['RIFF curto demais para ter o marcador', Buffer.from('RIFF\x00\x00\x00\x00')],
  ])('rejeita %s (CA-55, CA-56)', (_nome, buffer) => {
    expect(detectImageType(buffer)).toBeNull();
  });
});
