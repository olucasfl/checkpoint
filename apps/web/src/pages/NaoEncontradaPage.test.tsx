import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { NaoEncontradaPage } from './NaoEncontradaPage';

describe('NaoEncontradaPage (CA-37, CA-39)', () => {
  it('mostra o Chek confuso, o texto e o link para o catálogo; o texto vale sem o Chek', () => {
    const { container } = render(
      <MemoryRouter>
        <NaoEncontradaPage />
      </MemoryRouter>,
    );

    expect(container.querySelector('svg[data-chek="confuso"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
    container.querySelectorAll('svg').forEach((svg) => svg.remove());
    expect(
      screen.getByRole('heading', { level: 1, name: 'Página não encontrada' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para o catálogo' })).toHaveAttribute('href', '/');
  });
});
