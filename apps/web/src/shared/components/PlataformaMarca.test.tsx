import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  ALTURA_MINIMA_DA_LOGO_PX,
  PLATAFORMAS,
  PROVEDORES,
  PROVEDOR_SLUG,
  temCapacidade,
} from '@checkpoint/shared';
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
    expect(PROVEDORES).toEqual(['STEAM']);
    expect(PROVEDOR_SLUG).toEqual({ STEAM: 'steam' });
  });
  it('a Steam tem marcador neutro e a logo oficial existe em public/', () => {
    expect(PLATAFORMAS.STEAM.marcador.icone).toBeTruthy();
    const logo = PLATAFORMAS.STEAM.logo;
    expect(logo).not.toBeNull();
    expect(existsSync(resolve(process.cwd(), 'public', `.${logo!.arquivo}`))).toBe(true);
  });
  it('o arquivo servido é o logo inverso oficial versionado em docs/design (sem alteração)', async () => {
    const { readFileSync } = await import('node:fs');
    const servido = readFileSync(
      resolve(process.cwd(), 'public/plataformas/steam-logo.svg'),
      'utf8',
    );
    const original = readFileSync(
      resolve(process.cwd(), '../../docs/design/plataformas/steam/steam-logo-inverso.svg'),
      'utf8',
    );
    expect(servido).toBe(original);
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

describe('PlataformaMarca: logo oficial', () => {
  const alturaRenderizada = (container: HTMLElement) => {
    const img = container.querySelector('img')!;
    return { attr: Number(img.getAttribute('height')), css: parseFloat(img.style.height) };
  };

  it.each([
    [20, 50],
    [49, 50],
    [50, 50],
    [80, 80],
  ])('altura pedida %i px vira %i px (nunca abaixo de 50)', (pedida, esperada) => {
    const { container } = render(
      <PlataformaMarca provedor="STEAM" variante="logo" altura={pedida} />,
    );
    expect(alturaRenderizada(container)).toEqual({ attr: esperada, css: esperada });
    expect(esperada).toBeGreaterThanOrEqual(ALTURA_MINIMA_DA_LOGO_PX);
  });

  it('sem altura, usa o mínimo', () => {
    const { container } = render(<PlataformaMarca provedor="STEAM" variante="logo" />);
    expect(alturaRenderizada(container).css).toBe(ALTURA_MINIMA_DA_LOGO_PX);
  });

  it('o nome acessível é "Steam" e a logo fica sozinha (sem texto nem ícone junto), com espaço livre', () => {
    const { container } = render(<PlataformaMarca provedor="STEAM" variante="logo" />);
    expect(screen.getByRole('img', { name: 'Steam' })).toHaveAttribute(
      'src',
      '/plataformas/steam-logo.svg',
    );
    const envoltorio = container.firstElementChild as HTMLElement;
    expect(envoltorio.children).toHaveLength(1);
    expect(envoltorio.textContent).toBe('');
    expect(parseFloat(envoltorio.style.padding)).toBeGreaterThan(0);
  });

  it('a proporção do arquivo é mantida (sem esticar a marca)', () => {
    const { container } = render(<PlataformaMarca provedor="STEAM" variante="logo" altura={65} />);
    const img = container.querySelector('img')!;
    expect(Number(img.getAttribute('width'))).toBe(214);
  });

  it('arquivo que não carrega: cai no marcador com o nome em texto', () => {
    const { container } = render(<PlataformaMarca provedor="STEAM" variante="logo" />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Steam')).toBeInTheDocument();
  });
});

describe('a logo oficial nunca é renderizada abaixo de 50 px no código', () => {
  const fontes = import.meta.glob<string>(['/src/**/*.tsx', '!/src/**/*.test.tsx'], {
    query: '?raw',
    import: 'default',
    eager: true,
  });
  it('todo uso de variante="logo" passa altura literal >= 50 ou nenhuma', () => {
    for (const [arquivo, fonte] of Object.entries(fontes)) {
      for (const bloco of fonte.match(/<PlataformaMarca[^>]*variante="logo"[^>]*>/g) ?? []) {
        const altura = bloco.match(/altura=\{(\d+)\}/);
        if (altura) {
          expect(Number(altura[1]), arquivo).toBeGreaterThanOrEqual(ALTURA_MINIMA_DA_LOGO_PX);
        }
      }
    }
  });
});
