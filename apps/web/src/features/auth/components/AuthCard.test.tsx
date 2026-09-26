import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthCard } from './AuthCard';

describe('AuthCard (CA-07)', () => {
  it('o Chek fica acima do cartão e o título e o conteúdo mantêm papéis e nomes', () => {
    const { container } = render(
      <AuthCard title="Entrar">
        <button type="button">Ir</button>
      </AuthCard>,
    );
    const chek = container.querySelector('svg[data-chek="feliz"]');
    const cartao = container.querySelector('section');

    expect(chek).toHaveAttribute('aria-hidden', 'true');
    expect(chek?.compareDocumentPosition(cartao as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByRole('heading', { level: 1, name: 'Entrar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ir' })).toBeInTheDocument();
  });
});
