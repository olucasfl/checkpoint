import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { entrar, encerrarLocal, resetSessionForTests } from '@/features/auth/session/session';
import { PREFS, PREFS_PADRAO } from '@/shared/lib/prefs/prefs';
import { getPrefs, iniciarPrefs, resetPrefsForTests } from '@/shared/lib/prefs/prefs-store';
import { storage } from '@/shared/lib/storage/storage';
import { PrefsSync } from './PrefsSync';

const usuario = (id: string) => ({
  accessToken: 'token',
  usuario: { id, nome: id, email: `${id}@exemplo.com`, criadoEm: '2026-09-24T12:00:00.000Z' },
});

beforeEach(() => {
  storage.raw.removeAllWithPrefix('checkpoint:');
  resetPrefsForTests();
  resetSessionForTests();
  storage.set(PREFS, {
    ultimoUsuario: 'ana',
    porUsuario: { ana: { ...PREFS_PADRAO, destaque: 'violeta' } },
  });
});

describe('PrefsSync (perfil CA-15, CA-20)', () => {
  it('antes da sessão resolver, valem as de quem usou por último; depois, as de quem entrou', () => {
    iniciarPrefs();
    render(<PrefsSync />);
    expect(document.documentElement.dataset.destaque).toBe('violeta');

    act(() => entrar(usuario('bia')));

    expect(getPrefs().destaque).toBe('magenta');
    expect(document.documentElement.dataset.destaque).toBe('magenta');
    expect(storage.get(PREFS).ultimoUsuario).toBe('bia');
  });

  it('Bia sai e Ana entra: volta a Violeta da Ana', () => {
    render(<PrefsSync />);

    act(() => entrar(usuario('bia')));
    act(() => encerrarLocal('usuario'));
    act(() => entrar(usuario('ana')));

    expect(getPrefs().destaque).toBe('violeta');
    expect(document.documentElement.dataset.destaque).toBe('violeta');
  });
});
