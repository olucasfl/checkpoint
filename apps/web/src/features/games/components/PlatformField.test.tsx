import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FAVORITAS_LABEL, groupsWithFavorites, PLATFORM_GROUPS } from '../lib/platforms';
import { PlatformField } from './PlatformField';

function grupos() {
  return [...document.querySelectorAll('optgroup')].map((g) => ({
    label: g.label,
    opcoes: [...g.querySelectorAll('option')].map((o) => o.value),
  }));
}

const todasAsOpcoes = () => [...document.querySelectorAll('option')].map((o) => o.value);

describe('PlatformField com favoritas (perfil CA-19)', () => {
  it('as favoritas vêm primeiro, no grupo "Favoritas", e saem dos grupos da família', () => {
    render(
      <PlatformField
        value=""
        error={undefined}
        onChange={() => {}}
        favoritas={['PS5', 'Nintendo Switch']}
      />,
    );

    const [primeiro, ...resto] = grupos();
    expect(primeiro).toEqual({ label: 'Favoritas', opcoes: ['PS5', 'Nintendo Switch'] });
    expect(resto.find((g) => g.label === 'PlayStation')?.opcoes).not.toContain('PS5');
    expect(resto.find((g) => g.label === 'Nintendo')?.opcoes).not.toContain('Nintendo Switch');
    const opcoes = todasAsOpcoes();
    expect(new Set(opcoes).size).toBe(opcoes.length);
  });

  it('"Sem plataforma" continua a primeira opção e o padrão', () => {
    render(<PlatformField value="" error={undefined} onChange={() => {}} favoritas={['PC']} />);

    expect(todasAsOpcoes()[0]).toBe('');
    expect(screen.getByLabelText(/Plataforma/)).toHaveValue('');
  });

  it('sem favoritas, os grupos de antes', () => {
    render(<PlatformField value="" error={undefined} onChange={() => {}} />);

    expect(grupos().map((g) => g.label)).toEqual(PLATFORM_GROUPS.map((g) => g.label));
  });
});

describe('groupsWithFavorites', () => {
  it('família que fica vazia some (Celular com Android e iOS favoritos)', () => {
    const labels = groupsWithFavorites(['Android', 'iOS']).map((g) => g.label);

    expect(labels[0]).toBe(FAVORITAS_LABEL);
    expect(labels).not.toContain('Celular');
  });

  it('ignora favorita fora da lista e repetida', () => {
    const [favoritas] = groupsWithFavorites(['Atari 2600', 'PC', 'PC']);

    expect(favoritas).toEqual({ label: FAVORITAS_LABEL, platforms: ['PC'] });
  });

  it('com 8 favoritas, nenhuma opção some nem se repete', () => {
    const oito = ['PC', 'PS5', 'PS4', 'Xbox One', 'Nintendo Switch', 'Wii', 'Android', 'iOS'];
    const todas = groupsWithFavorites(oito).flatMap((g) => g.platforms);

    expect(todas.sort()).toEqual(PLATFORM_GROUPS.flatMap((g) => g.platforms).sort());
  });
});
