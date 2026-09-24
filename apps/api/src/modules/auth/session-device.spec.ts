import { deviceLabel } from './session-device';

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const EDGE_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0';
const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const SAFARI_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const SAMSUNG =
  'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36';

describe('deviceLabel', () => {
  it.each([
    ['Chrome no Android', CHROME_ANDROID, 'Chrome · Android'],
    ['Safari no iOS', SAFARI_IOS, 'Safari · iOS'],
    ['Edge no Windows (que também diz "Chrome")', EDGE_WINDOWS, 'Edge · Windows'],
    ['Firefox no Linux', FIREFOX_LINUX, 'Firefox · Linux'],
    ['Chrome no Windows', CHROME_WINDOWS, 'Chrome · Windows'],
    ['Safari no macOS', SAFARI_MAC, 'Safari · macOS'],
    ['Samsung Internet (que também diz "Chrome" e "Linux")', SAMSUNG, 'Samsung Internet · Android'],
  ])('%s', (_nome, userAgent, expected) => {
    expect(deviceLabel(userAgent)).toBe(expected);
  });

  it.each([['curl/8.5.0'], [''], [undefined]])(
    'User-Agent desconhecido (%j) vira "Outro · Outro"',
    (userAgent) => {
      expect(deviceLabel(userAgent)).toBe('Outro · Outro');
    },
  );

  it('nunca passa de 80 caracteres (o campo é VarChar(80))', () => {
    expect(deviceLabel('x'.repeat(5000)).length).toBeLessThanOrEqual(80);
  });

  it('não inclui IP nem trechos do User-Agent além do navegador e do sistema', () => {
    expect(deviceLabel(`${CHROME_ANDROID} 203.0.113.9`)).toBe('Chrome · Android');
  });
});
