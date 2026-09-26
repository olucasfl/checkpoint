import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BarraDeCriterio } from './BarraDeCriterio';

describe('BarraDeCriterio (CA-42)', () => {
  it('a barra é a imagem "Gameplay 9,2 de 10", preenchida em 92%, e a nota tem vírgula', () => {
    const { container } = render(<BarraDeCriterio nota={9.2} rotulo="Gameplay" />);

    expect(screen.getByRole('img', { name: 'Gameplay 9,2 de 10' })).toBeInTheDocument();
    expect(container.querySelector('.bg-destaque')).toHaveStyle({ width: '92%' });
    expect(screen.getByText('9,2')).toBeInTheDocument();
  });

  it('sem nota: "sem nota" e a barra vazia, sem imagem (vazio não é 0)', () => {
    const { container } = render(<BarraDeCriterio nota={null} rotulo="Gameplay" />);

    expect(screen.getByText('sem nota')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('.bg-destaque')).toHaveStyle({ width: '0%' });
  });

  it('a nota 0 é uma nota: "0,0" e a imagem, sem "sem nota"', () => {
    render(<BarraDeCriterio nota={0} rotulo="Gráficos" />);

    expect(screen.getByRole('img', { name: 'Gráficos 0,0 de 10' })).toBeInTheDocument();
    expect(screen.getByText('0,0')).toBeInTheDocument();
    expect(screen.queryByText('sem nota')).toBeNull();
  });
});
