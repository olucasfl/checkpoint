import { afterEach, describe, expect, it, vi } from 'vitest';
import { ehSafariIos, estaInstalado } from './display';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1';
const IPHONE_FIREFOX =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15';
const IPAD_COMO_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const DESKTOP_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const original = {
  userAgent: navigator.userAgent,
  matchMedia: window.matchMedia,
};

function setUserAgent(value: string, maxTouchPoints = 0) {
  Object.defineProperty(navigator, 'userAgent', { value, configurable: true });
  Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true });
}

function setMatchMedia(value: unknown) {
  Object.defineProperty(window, 'matchMedia', { value, configurable: true, writable: true });
}

function setDisplayMode(standalone: boolean) {
  setMatchMedia(
    vi.fn((query: string) => ({ matches: standalone && query === '(display-mode: standalone)' })),
  );
}

function setNavigatorStandalone(value: boolean | undefined) {
  Object.defineProperty(navigator, 'standalone', { value, configurable: true });
}

afterEach(() => {
  setUserAgent(original.userAgent);
  setMatchMedia(original.matchMedia);
  setNavigatorStandalone(undefined);
});

describe('estaInstalado', () => {
  it('display-mode standalone → instalado', () => {
    setDisplayMode(true);

    expect(estaInstalado()).toBe(true);
  });

  it('navigator.standalone === true (iOS) → instalado, mesmo sem o media query', () => {
    setDisplayMode(false);
    setNavigatorStandalone(true);

    expect(estaInstalado()).toBe(true);
  });

  it('aba do navegador (browser) → não instalado', () => {
    setDisplayMode(false);
    setNavigatorStandalone(false);

    expect(estaInstalado()).toBe(false);
  });

  it('sem matchMedia (ambiente antigo), não lança', () => {
    setMatchMedia(undefined);

    expect(estaInstalado()).toBe(false);
  });
});

describe('ehSafariIos', () => {
  it('iPhone no Safari → sim', () => {
    setDisplayMode(false);
    setUserAgent(IPHONE_SAFARI);

    expect(ehSafariIos()).toBe(true);
  });

  it('iPad que se apresenta como Mac (iPadOS 13+, com toque) → sim', () => {
    setDisplayMode(false);
    setUserAgent(IPAD_COMO_MAC, 5);

    expect(ehSafariIos()).toBe(true);
  });

  it('Mac de verdade (sem toque) → não', () => {
    setDisplayMode(false);
    setUserAgent(IPAD_COMO_MAC, 0);

    expect(ehSafariIos()).toBe(false);
  });

  it.each([
    ['Chrome no iOS', IPHONE_CHROME],
    ['Firefox no iOS', IPHONE_FIREFOX],
    ['Chrome no Android', ANDROID_CHROME],
    ['Chrome no desktop', DESKTOP_CHROME],
  ])('%s → não', (_nome, userAgent) => {
    setDisplayMode(false);
    setUserAgent(userAgent);

    expect(ehSafariIos()).toBe(false);
  });

  it('iPhone Safari, mas já aberto como app instalado → não', () => {
    setUserAgent(IPHONE_SAFARI);
    setDisplayMode(false);
    setNavigatorStandalone(true);

    expect(ehSafariIos()).toBe(false);
  });
});
