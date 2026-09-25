import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectivity } from '@/shared/lib/connectivity';
import { ConnectionBanner } from './ConnectionBanner';

const probe = vi.fn<() => Promise<unknown>>();

beforeEach(() => {
  probe.mockReset();
  probe.mockRejectedValue(new Error('sem resposta'));
  connectivity.setProbe(probe);
  connectivity.reportReachable();
});

afterEach(() => {
  act(() => connectivity.reportReachable());
  vi.useRealTimers();
});

const region = () => screen.getByRole('status');

describe('ConnectionBanner', () => {
  it('online: a região viva existe, vazia', () => {
    render(<ConnectionBanner />);

    expect(region()).toBeEmptyDOMElement();
    expect(region()).toHaveAttribute('aria-live', 'polite');
  });

  it('offline: texto do estado, ícone wifi_off aria-hidden e nenhum botão', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<ConnectionBanner />);

    act(() => connectivity.reportUnreachable());

    expect(region()).toHaveTextContent(
      'Você está offline. O que já está na tela continua visível.',
    );
    expect(region().textContent).toContain('wifi_off');
    expect(region().querySelector('.icon')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('sem-servidor: texto, ícone cloud_off e o botão "Tentar agora"', () => {
    render(<ConnectionBanner />);

    act(() => connectivity.reportUnreachable());

    expect(region()).toHaveTextContent('Não foi possível falar com o servidor. Tentando de novo…');
    expect(region().textContent).toContain('cloud_off');
    expect(screen.getByRole('button', { name: 'Tentar agora' })).toBeInTheDocument();
  });

  it('"Tentar agora" dispara a sondagem', async () => {
    render(<ConnectionBanner />);
    act(() => connectivity.reportUnreachable());

    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar agora' }));

    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('ao voltar: "Conexão restabelecida" com ícone wifi, que some sozinho em 3 s', () => {
    vi.useFakeTimers();
    render(<ConnectionBanner />);
    act(() => connectivity.reportUnreachable());

    act(() => connectivity.reportReachable());

    expect(region()).toHaveTextContent('Conexão restabelecida');
    expect(region().textContent).toContain('wifi');
    act(() => {
      vi.advanceTimersByTime(2_999);
    });
    expect(region()).toHaveTextContent('Conexão restabelecida');
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(region()).toBeEmptyDOMElement();
  });

  it('cair de novo antes dos 3 s troca "restabelecida" pelo aviso de queda', () => {
    vi.useFakeTimers();
    render(<ConnectionBanner />);
    act(() => connectivity.reportUnreachable());
    act(() => connectivity.reportReachable());

    act(() => connectivity.reportUnreachable());

    expect(region()).not.toHaveTextContent('Conexão restabelecida');
    expect(region()).toHaveTextContent('Não foi possível falar com o servidor');
  });

  it('fica abaixo da área segura do topo e acima do resto (z-50), sem tocar a barra inferior', () => {
    render(<ConnectionBanner />);

    expect(region().style.top).toContain('env(safe-area-inset-top)');
    expect(region()).toHaveClass('fixed', 'z-50');
    expect(region()).not.toHaveClass('bottom-0');
  });

  it('desliga a animação de entrada com movimento reduzido (regra global de prefers-reduced-motion)', async () => {
    const css = (await import('@/styles/index.css?raw')).default;

    expect(css).toMatch(/\.banner-in\s*\{[^}]*animation:\s*banner-in/);
    // A regra global fica numa variante com dois gatilhos: o do sistema (este) e o do /perfil.
    expect(css).toMatch(
      /@custom-variant movimento-reduzido\s*\{\s*@media \(prefers-reduced-motion: reduce\)/,
    );
    expect(css).toMatch(
      /\*,\s*\*::before,\s*\*::after\s*\{\s*@variant movimento-reduzido\s*\{[^}]*animation:\s*none !important/,
    );
  });
});
