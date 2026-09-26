import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandLogo } from './BrandLogo';

describe('BrandLogo', () => {
  it('o Chek (decorativo) e o nome "Checkpoint"', () => {
    const { container } = render(<BrandLogo />);

    expect(screen.getByText('Checkpoint')).toBeInTheDocument();
    expect(container.querySelector('svg[data-chek="feliz"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('com `mostrarChek` falso, só o nome (o Chek já está acima do cartão)', () => {
    const { container } = render(<BrandLogo mostrarChek={false} />);

    expect(screen.getByText('Checkpoint')).toBeInTheDocument();
    expect(container.querySelector('svg')).toBeNull();
  });
});
