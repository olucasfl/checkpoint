import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUpdatePromptVisivel } from '@/shared/lib/pwa/update-prompt-visibility';
import { UpdatePrompt } from './UpdatePrompt';

const update = vi.hoisted(() => ({
  precisaAtualizar: false,
  atualizar: vi.fn(),
  adiar: vi.fn(),
}));

vi.mock('@/shared/lib/pwa/use-app-update', () => ({ useAppUpdate: () => update }));

const region = () => screen.getByRole('status');

function addDialog(open: boolean) {
  const dialog = document.createElement('dialog');
  if (open) {
    dialog.setAttribute('open', '');
  }
  document.body.append(dialog);
  return dialog;
}

beforeEach(() => {
  update.precisaAtualizar = false;
  update.atualizar.mockReset();
  update.adiar.mockReset();
  document.querySelectorAll('dialog').forEach((dialog) => dialog.remove());
});

describe('UpdatePrompt', () => {
  it('sem versão nova: a região viva existe, vazia', () => {
    render(<UpdatePrompt />);

    expect(region()).toBeEmptyDOMElement();
    expect(region()).toHaveAttribute('aria-live', 'polite');
  });

  it('com versão nova: "Nova versão disponível", Atualizar e Depois', () => {
    update.precisaAtualizar = true;
    render(<UpdatePrompt />);

    expect(region()).toHaveTextContent('Nova versão disponível');
    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Depois' })).toBeInTheDocument();
  });

  it('Atualizar chama atualizar(); Depois chama adiar()', async () => {
    update.precisaAtualizar = true;
    const user = userEvent.setup();
    render(<UpdatePrompt />);

    await user.click(screen.getByRole('button', { name: 'Atualizar' }));
    expect(update.atualizar).toHaveBeenCalledTimes(1);
    expect(update.adiar).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Depois' }));
    expect(update.adiar).toHaveBeenCalledTimes(1);
  });

  it('Depois esconde o aviso (o hook devolve precisaAtualizar falso após adiar)', () => {
    update.precisaAtualizar = true;
    const { rerender } = render(<UpdatePrompt />);
    expect(region()).toHaveTextContent('Nova versão disponível');

    update.precisaAtualizar = false;
    rerender(<UpdatePrompt />);

    expect(region()).toBeEmptyDOMElement();
  });

  it('com um <dialog open> no documento, o aviso NÃO aparece (CA-30)', () => {
    update.precisaAtualizar = true;
    addDialog(true);

    render(<UpdatePrompt />);

    expect(region()).toBeEmptyDOMElement();
  });

  it('aparece quando o diálogo fecha, e some de novo se outro abrir (CA-30)', async () => {
    update.precisaAtualizar = true;
    const dialog = addDialog(true);
    render(<UpdatePrompt />);
    expect(region()).toBeEmptyDOMElement();

    await act(async () => {
      dialog.removeAttribute('open');
    });
    expect(region()).toHaveTextContent('Nova versão disponível');

    await act(async () => {
      dialog.setAttribute('open', '');
    });
    expect(region()).toBeEmptyDOMElement();
  });

  it('informa o InstallNudge: visível só com versão nova e sem diálogo (a atualização tem prioridade)', async () => {
    const { result } = renderHook(() => useUpdatePromptVisivel());
    update.precisaAtualizar = true;
    const dialog = addDialog(true);
    const { unmount } = render(<UpdatePrompt />);
    expect(result.current).toBe(false);

    await act(async () => {
      dialog.removeAttribute('open');
    });
    expect(result.current).toBe(true);

    unmount();
    expect(result.current).toBe(false);
  });

  it('dialog fechado (sem o atributo open) não esconde o aviso', () => {
    update.precisaAtualizar = true;
    addDialog(false);

    render(<UpdatePrompt />);

    expect(region()).toHaveTextContent('Nova versão disponível');
  });

  it('a animação de entrada tem nome próprio e some com movimento reduzido', async () => {
    const css = (await import('@/styles/index.css?raw')).default;

    expect(css).toMatch(/\.update-in\s*\{[^}]*animation:\s*update-in/);
    expect(css).toMatch(/@keyframes update-in\b/);
    // A regra global fica numa variante com dois gatilhos: o do sistema (este) e o do /perfil.
    expect(css).toMatch(
      /@custom-variant movimento-reduzido\s*\{\s*@media \(prefers-reduced-motion: reduce\)/,
    );
    expect(css).toMatch(
      /\*,\s*\*::before,\s*\*::after\s*\{\s*@variant movimento-reduzido\s*\{[^}]*animation:\s*none !important/,
    );
  });
});
