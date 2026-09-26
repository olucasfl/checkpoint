import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '@/shared/lib/api-client';
import { StatusPage } from './StatusPage';

vi.mock('@/shared/lib/api-client', () => ({ apiClient: { get: vi.fn() } }));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <StatusPage />
    </QueryClientProvider>,
  );
}

describe('/status (CA-68)', () => {
  it('mostra o diagnóstico da API com os tokens do tema (sem cores padrão do Tailwind)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { status: 'ok', database: 'up', timestamp: '2026-09-25T12:00:00.000Z' },
    });
    const { container } = renderPage();

    expect(await screen.findByText('ok')).toBeInTheDocument();
    expect(screen.getByText('up')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Status da API' })).toBeInTheDocument();
    expect(container.innerHTML).not.toMatch(/slate-|red-400/);
  });

  it('carregando é um status e erro é um alert', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('fora do ar'));
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(/Nao foi possivel falar com a API/);
  });
});
