import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BrandLogo } from './BrandLogo';

describe('BrandLogo (F4)', () => {
  it('círculo `destaque` com a bandeira e o nome "Checkpoint", como no catálogo', () => {
    const { container } = render(<BrandLogo />);

    expect(screen.getByText('Checkpoint')).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).toHaveClass(
      'rounded-full',
      'bg-destaque',
      'text-fundo',
    );
  });
});
