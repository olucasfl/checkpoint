import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Chek, type ChekExpressao } from './Chek';

const EXPRESSOES: ChekExpressao[] = ['feliz', 'dormindo', 'confuso', 'comemorando', 'cadeado'];

describe('Chek (CA-01, CA-02)', () => {
  it.each(EXPRESSOES)('%s: decorativo por padrão e sem hex literal', (expressao) => {
    const { container } = render(<Chek expressao={expressao} />);
    const svg = container.querySelector('svg');

    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('data-chek', expressao);
    expect(container.innerHTML).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('com título vira imagem com esse nome, sem aria-hidden', () => {
    const { getByRole } = render(<Chek titulo="Chek feliz" />);

    expect(getByRole('img', { name: 'Chek feliz' })).not.toHaveAttribute('aria-hidden');
  });

  it('duas instâncias não repetem id de gradiente', () => {
    const { container } = render(
      <>
        <Chek />
        <Chek expressao="comemorando" />
      </>,
    );
    const ids = [...container.querySelectorAll('[id]')].map((el) => el.id);

    expect(ids.length).toBe(4);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('altura vira estilo e `animado` marca a bandeira', () => {
    const { container } = render(<Chek altura={96} animado />);

    expect(container.querySelector('svg')).toHaveStyle({ height: '96px' });
    expect(container.querySelector('.chek-bandeira')).not.toBeNull();
  });

  it('sem `animado` a bandeira fica parada', () => {
    const { container } = render(<Chek />);

    expect(container.querySelector('.chek-bandeira')).toBeNull();
  });
});
