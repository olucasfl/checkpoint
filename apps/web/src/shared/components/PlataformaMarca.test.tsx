import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PLATAFORMAS, PROVEDORES, PROVEDOR_SLUG, temCapacidade } from '@checkpoint/shared';
import { PlataformaMarca } from './PlataformaMarca';

describe('cadastro de plataformas', () => {
  it('a Steam tem id, slug, nome, "ligadoA" e as cinco capacidades', () => {
    expect(PLATAFORMAS.STEAM).toMatchObject({
      id: 'STEAM',
      slug: 'steam',
      nome: 'Steam',
      ligadoA: 'à Steam',
    });
    for (const c of ['horas', 'conquistas', 'biblioteca', 'ultimaVezJogado', 'nivel'] as const) {
      expect(temCapacidade('STEAM', c)).toBe(true);
    }
  });
  it('PROVEDORES e PROVEDOR_SLUG saem do cadastro', () => {
    expect(PROVEDORES).toEqual(['STEAM', 'PLAYSTATION']);
    expect(PROVEDOR_SLUG).toEqual({ STEAM: 'steam', PLAYSTATION: 'playstation' });
  });
  it('Steam e PlayStation têm o símbolo em public/ e nenhuma logo grande', () => {
    for (const id of ['STEAM', 'PLAYSTATION'] as const) {
      const { simbolo } = PLATAFORMAS[id].marcador;
      expect(simbolo).toBeTruthy();
      expect(existsSync(resolve(process.cwd(), 'public', `.${simbolo!}`))).toBe(true);
      expect(PLATAFORMAS[id].logo).toBeNull();
    }
  });
});

describe('PlataformaMarca: marcador', () => {
  it('um role="img" com o nome acessível e nenhuma imagem de marca', () => {
    const { container } = render(<PlataformaMarca provedor="STEAM" variante="marcador" />);
    expect(screen.getByRole('img', { name: 'Steam' })).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });
  it('decorativo: nada é lido', () => {
    render(<PlataformaMarca provedor="STEAM" variante="marcador" decorativa />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText('Steam')).toBeNull();
  });
});

describe('PlataformaMarca: símbolo', () => {
  it.each(['STEAM', 'PLAYSTATION'] as const)(
    '%s: o símbolo é uma máscara na cor do texto, sem <img>',
    (id) => {
      const { container } = render(<PlataformaMarca provedor={id} variante="marcador" />);
      const simbolo = container.querySelector('span[aria-hidden] ') as HTMLElement;
      expect(container.querySelector('img')).toBeNull();
      expect(simbolo.style.maskImage || simbolo.style.webkitMaskImage).toContain(
        PLATAFORMAS[id].marcador.simbolo,
      );
    },
  );
  it('"logo" sem arquivo cai no símbolo com o nome em texto', () => {
    const { container } = render(<PlataformaMarca provedor="STEAM" variante="logo" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Steam')).toBeInTheDocument();
  });
});
