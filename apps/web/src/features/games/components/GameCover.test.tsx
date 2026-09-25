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
