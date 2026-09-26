import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it.each([
    ['QUERO_JOGAR', 'Quero jogar'],
    ['JOGANDO', 'Jogando'],
    ['ZERADO', 'Zerado'],
  ] as const)(
    '%s mostra "%s" numa linha só (a fonte mais larga não quebra o selo)',
    (status, rotulo) => {
      render(<StatusBadge status={status} />);

      expect(screen.getByText(rotulo)).toHaveClass('whitespace-nowrap');
    },
  );
});
