import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ListEmpty, ListError } from './ListStates';

describe('ListEmpty e ListError com o Chek (CA-34, CA-35, CA-39)', () => {
  it('catálogo vazio: Chek dormindo e os mesmos textos', () => {
    const { container } = render(<ListEmpty filtered={false} />);

    expect(container.querySelector('svg[data-chek="dormindo"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    expect(screen.getByText('Nenhum jogo cadastrado')).toBeInTheDocument();
    expect(screen.getByText('Adicione o primeiro jogo para começar.')).toBeInTheDocument();
  });

  it('filtro sem resultado: Chek dormindo e "Nenhum jogo neste status"', () => {
    const { container } = render(<ListEmpty filtered />);

    expect(container.querySelector('svg[data-chek="dormindo"]')).not.toBeNull();
    expect(screen.getByText('Nenhum jogo neste status')).toBeInTheDocument();
  });

  it('erro: Chek confuso, role="alert" e "Tentar de novo" chama o refetch uma vez', async () => {
    const aoTentar = vi.fn();
    const { container } = render(<ListError onRetry={aoTentar} />);

    expect(container.querySelector('svg[data-chek="confuso"]')).not.toBeNull();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    expect(aoTentar).toHaveBeenCalledTimes(1);
  });

  it('o texto vale sem o Chek: removendo os SVGs, as mesmas consultas por texto acham tudo', () => {
    const { container } = render(<ListError onRetry={() => undefined} offline />);
    container.querySelectorAll('svg').forEach((svg) => svg.remove());

    expect(screen.getByText('Não deu para carregar')).toBeInTheDocument();
    expect(screen.getByText(/Sem conexão/)).toBeInTheDocument();
  });
});
