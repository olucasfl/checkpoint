import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GameCover } from './GameCover';

const imagem = (container: HTMLElement) => container.querySelector('img');

describe('GameCover: a cadeia de capas (CA-42)', () => {
  it('mostra a capa enviada e, se ela falhar, a próxima alternativa, e por fim a gerada', () => {
    const { container } = render(
      <GameCover
        titulo="Celeste"
        capaUrl="https://bucket/enviada.jpg"
        alternativas={['https://cdn/oficial.jpg', 'https://cdn/header.jpg']}
      />,
    );
    expect(imagem(container)).toHaveAttribute('src', 'https://bucket/enviada.jpg');

    fireEvent.error(imagem(container)!);
    expect(imagem(container)).toHaveAttribute('src', 'https://cdn/oficial.jpg');

    fireEvent.error(imagem(container)!);
    expect(imagem(container)).toHaveAttribute('src', 'https://cdn/header.jpg');

    fireEvent.error(imagem(container)!);
    expect(imagem(container)).toBeNull();
    expect(container.querySelector('[data-cover="generated"]')).toBeInTheDocument();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('sem capa enviada, a oficial vem primeiro e cai para o header', () => {
    const { container } = render(
      <GameCover
        titulo="Celeste"
        capaUrl={null}
        alternativas={['https://cdn/oficial.jpg', 'https://cdn/header.jpg']}
      />,
    );
    expect(imagem(container)).toHaveAttribute('src', 'https://cdn/oficial.jpg');
    fireEvent.error(imagem(container)!);
    expect(imagem(container)).toHaveAttribute('src', 'https://cdn/header.jpg');
  });

  it('sem nenhuma imagem: a capa gerada, com a inicial', () => {
    const { container } = render(<GameCover titulo="Celeste" capaUrl={null} />);
    expect(container.querySelector('[data-cover="generated"]')).toHaveTextContent('C');
  });

  it('a imagem é decorativa e sem Referer', () => {
    const { container } = render(<GameCover titulo="Celeste" capaUrl="https://cdn/x.jpg" />);
    expect(imagem(container)).toHaveAttribute('alt', '');
    expect(imagem(container)).toHaveAttribute('referrerpolicy', 'no-referrer');
  });
});

describe('GameCover em pé, 3:4 (CA-37, CA-38, CA-41)', () => {
  it.each([
    ['tile', ['w-[132px]', 'md:w-[150px]', 'aspect-[3/4]']],
    ['tileCompacto', ['w-[108px]', 'md:w-[120px]', 'aspect-[3/4]']],
    ['detalhe', ['max-w-[300px]', 'aspect-[3/4]']],
    ['preview', ['w-[72px]', 'aspect-[3/4]']],
  ] as const)('a capa gerada %s é em pé (3:4)', (variant, classes) => {
    const { container } = render(
      <GameCover titulo="Hollow Knight" capaUrl={null} variant={variant} />,
    );

    const capa = container.querySelector('[data-cover="generated"]') as HTMLElement;
    for (const classe of classes) {
      expect(capa).toHaveClass(classe);
    }
    expect(capa).toHaveTextContent('HK');
  });

  it('as iniciais ficam no canto superior esquerdo, com o brilho e o anel decorativos (sem texto extra)', () => {
    const { container } = render(<GameCover titulo="Celeste" capaUrl={null} variant="tile" />);

    const capa = container.querySelector('[data-cover="generated"]') as HTMLElement;
    expect(capa.querySelector('.capa-brilho')).not.toBeNull();
    expect(capa.querySelector('.capa-anel')).not.toBeNull();
    const iniciais = capa.querySelector('.capa-iniciais') as HTMLElement;
    expect(iniciais).toHaveClass('absolute', 'left-3', 'top-2.5');
    expect(capa).toHaveTextContent(/^C$/);
  });

  it('a mesma cor por título em qualquer tamanho (o hash não mudou)', () => {
    const cor = (variant: 'tile' | 'detalhe') => {
      const { container, unmount } = render(
        <GameCover titulo="Hades" capaUrl={null} variant={variant} />,
      );
      const classe = Array.from((container.firstElementChild as HTMLElement).classList).find((c) =>
        c.startsWith('bg-capa-'),
      );
      unmount();
      return classe;
    };

    expect(cor('tile')).toBeDefined();
    expect(cor('tile')).toBe(cor('detalhe'));
  });

  it('a imagem enviada, de qualquer proporção, entra em 3:4 com object-fit cover e recorte centralizado', () => {
    const { container } = render(
      <GameCover titulo="Celeste" capaUrl="https://bucket/larga-16x9.jpg" variant="tile" />,
    );

    const caixa = container.querySelector('[data-cover="image"]') as HTMLElement;
    expect(caixa).toHaveClass('aspect-[3/4]', 'overflow-hidden');
    const imagem = caixa.querySelector('img') as HTMLImageElement;
    expect(imagem).toHaveClass('object-cover', 'object-center', 'size-full');
    expect(imagem).toHaveAttribute('alt', '');
  });

  it('sem header.jpg: enviada → oficial → gerada', () => {
    const { container } = render(
      <GameCover
        titulo="Celeste"
        capaUrl="https://bucket/enviada.jpg"
        alternativas={['https://cdn/oficial.jpg']}
      />,
    );
    const imagem = () => container.querySelector('img') as HTMLImageElement;

    fireEvent.error(imagem());
    expect(imagem()).toHaveAttribute('src', 'https://cdn/oficial.jpg');
    fireEvent.error(imagem());
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-cover="generated"]')).toBeInTheDocument();
  });
});
