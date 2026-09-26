import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RotuloPendente } from './RotuloPendente';

function Botao({ pendente, indicador }: { pendente: boolean; indicador?: boolean }) {
  return (
    <button type="button" disabled={pendente} aria-busy={pendente}>
      <RotuloPendente
        pendente={pendente}
        normal="Salvar"
        ocupado="Salvando…"
        indicador={indicador}
      />
    </button>
  );
}

describe('RotuloPendente (CA-30)', () => {
  it('em repouso mostra só o texto normal, sem indicador', () => {
    const { container } = render(<Botao pendente={false} />);

    expect(screen.getByRole('button', { name: 'Salvar' })).toBeInTheDocument();
    expect(container.querySelector('.gira')).toBeNull();
  });

  it('pendente mostra o indicador e o texto ocupado, sem duplicar texto no DOM', () => {
    const { container } = render(<Botao pendente />);

    expect(screen.getByRole('button', { name: 'Salvando…' })).toBeDisabled();
    expect(container.querySelector('.gira')).not.toBeNull();
    expect(screen.getAllByText('Salvando…')).toHaveLength(1);
  });

  it('reserva a largura dos dois textos nos dois estados (a mesma marcação em ambos)', () => {
    const { container, rerender } = render(<Botao pendente={false} />);
    const reserva = () => container.querySelector('.reserva');

    expect(reserva()).toHaveAttribute('data-normal', 'Salvar');
    expect(reserva()).toHaveAttribute('data-ocupado', 'Salvando…');
    rerender(<Botao pendente />);
    expect(reserva()).toHaveAttribute('data-normal', 'Salvar');
    expect(reserva()).toHaveAttribute('data-ocupado', 'Salvando…');
  });

  it('sem indicador (o botão já tem um ícone que gira), só o texto', () => {
    const { container } = render(<Botao pendente indicador={false} />);

    expect(container.querySelector('.gira')).toBeNull();
  });
});
