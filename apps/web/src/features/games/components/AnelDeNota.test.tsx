import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnelDeNota } from './AnelDeNota';

describe('AnelDeNota (CA-21)', () => {
  it('a média 8,3 é uma imagem com o nome "Nota 8,3 de 10", e o número visível não é lido de novo', () => {
    render(<AnelDeNota nota={8.3} />);

    const anel = screen.getByRole('img', { name: 'Nota 8,3 de 10' });
    expect(anel).toHaveTextContent('8,3');
    expect(anel.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('sem média, sem anel: nada é renderizado', () => {
    const { container } = render(<AnelDeNota nota={null} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('média 0 é nota: o anel existe, vazio, com "0,0"', () => {
    render(<AnelDeNota nota={0} />);

    const anel = screen.getByRole('img', { name: 'Nota 0,0 de 10' });
    expect(anel).toHaveTextContent('0,0');
    expect(anel.style.getPropertyValue('--pct')).toBe('0');
  });

  it.each([
    [8.3, '83'],
    [10, '100'],
    [5, '50'],
  ])('a fração do arco: %s vira --pct %s', (nota, pct) => {
    render(<AnelDeNota nota={nota} />);

    expect(screen.getByRole('img').style.getPropertyValue('--pct')).toBe(pct);
  });

  it('o arco é um conic-gradient de tokens (nenhum hex) definido no CSS do app', () => {
    render(<AnelDeNota nota={7} />);

    expect(screen.getByRole('img')).toHaveClass('anel-nota', 'rounded-full');
  });
});
