import { afterEach, describe, expect, it, vi } from 'vitest';
import mainSource from '@/main.tsx?raw';
import { storage } from '@/shared/lib/storage/storage';
import { INSTALADO } from './install-keys';
import {
  assinar,
  pedirInstalacao,
  podeInstalar,
  type BeforeInstallPromptEvent,
} from './install-prompt';

/** O evento do Chrome, falso: cancelável, com `prompt()` e `userChoice` controláveis. */
function fakeEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true });
  const prompt = vi.fn(() => Promise.resolve());
  Object.assign(event, {
    prompt,
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  });
  return { event: event as BeforeInstallPromptEvent, prompt };
}

afterEach(() => {
  // O módulo guarda o evento entre testes; `appinstalled` o descarta, e a chave que ele grava sai.
  window.dispatchEvent(new Event('appinstalled'));
  storage.clearScope('dispositivo');
});

describe('main.tsx', () => {
  it('importa o install-prompt ANTES de qualquer outro import (o evento chega cedo e uma vez)', () => {
    const firstImport = /^\s*import\s[^;]+;/m.exec(mainSource)?.[0];

    expect(firstImport).toBe("import '@/shared/lib/pwa/install-prompt';");
  });
});

describe('beforeinstallprompt', () => {
  it('é capturado na importação, com preventDefault, e podeInstalar() vira verdadeiro', () => {
    const { event } = fakeEvent();
    expect(podeInstalar()).toBe(false);

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(podeInstalar()).toBe(true);
  });

  it('avisa quem assinou, e para de avisar depois de cancelar', () => {
    const callback = vi.fn();
    const cancelar = assinar(callback);

    window.dispatchEvent(fakeEvent().event);
    expect(callback).toHaveBeenCalledTimes(1);

    cancelar();
    window.dispatchEvent(fakeEvent().event);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});

describe('pedirInstalacao', () => {
  it('sem evento guardado: "indisponivel", sem lançar', async () => {
    await expect(pedirInstalacao()).resolves.toBe('indisponivel');
  });

  it('aceito: chama prompt() e devolve "aceito"; o evento é descartado (só vale uma vez)', async () => {
    const { event, prompt } = fakeEvent('accepted');
    window.dispatchEvent(event);

    await expect(pedirInstalacao()).resolves.toBe('aceito');

    expect(prompt).toHaveBeenCalledTimes(1);
    expect(podeInstalar()).toBe(false);
    await expect(pedirInstalacao()).resolves.toBe('indisponivel');
  });

  it('recusado: devolve "recusado" e também descarta o evento', async () => {
    window.dispatchEvent(fakeEvent('dismissed').event);

    await expect(pedirInstalacao()).resolves.toBe('recusado');

    expect(podeInstalar()).toBe(false);
  });

  it('prompt() que falha: "indisponivel", sem lançar', async () => {
    const { event, prompt } = fakeEvent();
    prompt.mockRejectedValueOnce(new Error('já usado'));
    window.dispatchEvent(event);

    await expect(pedirInstalacao()).resolves.toBe('indisponivel');
  });

  it('avisa os assinantes ao consumir o evento', async () => {
    window.dispatchEvent(fakeEvent().event);
    const callback = vi.fn();
    assinar(callback);

    await pedirInstalacao();

    expect(callback).toHaveBeenCalled();
  });
});

describe('appinstalled', () => {
  it('grava instalacao:instalado, descarta o evento e avisa os assinantes', () => {
    window.dispatchEvent(fakeEvent().event);
    const callback = vi.fn();
    assinar(callback);
    expect(storage.get(INSTALADO)).toBe(false);

    window.dispatchEvent(new Event('appinstalled'));

    expect(storage.get(INSTALADO)).toBe(true);
    expect(podeInstalar()).toBe(false);
    expect(callback).toHaveBeenCalled();
  });
});
