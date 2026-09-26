import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { type DadosJogoPlataforma, type Game, type GameStatus } from '@checkpoint/shared';
import { describe, expect, it, vi } from 'vitest';
import { DestaqueContinue } from './DestaqueContinue';
import { GameTile } from './GameTile';
import { ListLoading } from './ListStates';
import { Prateleira } from './Prateleira';
import { StatusFilter } from './StatusFilter';

const jogo = (id: string, extra: Partial<Game> = {}): Game => ({
  id,
  titulo: `Jogo ${id}`,
  plataforma: null,
  status: 'JOGANDO',
  notas: { gameplay: null, historia: null, graficos: null, trilhaSonora: null, performance: null },
  notaMedia: null,
  descricao: null,
  capaUrl: null,
  criadoEm: '2026-09-23T12:00:00.000Z',
  dadosPlataforma: [],
  atualizadoEm: '2026-09-23T12:00:00.000Z',
  ...extra,
});

const steam: DadosJogoPlataforma = {
  provedor: 'STEAM',
  idExterno: '1',
  minutosJogados: 2550,
  ultimaVezJogadoEm: null,
  conquistasTotal: 40,
  conquistasDesbloqueadas: 12,
  capaUrl: null,
  atualizadoEm: '2026-09-25T12:00:00.000Z',
};

const noRouter = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('GameTile (CA-15 a CA-19)', () => {
  const acoes = { onEdit: vi.fn(), onRemove: vi.fn() };

  it('o título é o link do detalhe e a plataforma vira "Xbox Series X/S" só na tela', () => {
    noRouter(<GameTile game={jogo('a', { plataforma: 'Xbox Series X|S' })} {...acoes} />);

    expect(screen.getByRole('link', { name: 'Jogo a' })).toHaveAttribute('href', '/jogos/a');
    expect(screen.getByText('Xbox Series X/S')).toBeInTheDocument();
    expect(screen.queryByText(/X\|S/)).toBeNull();
  });

  it('sem média, plataforma e vínculo: sem anel, sem chip, sem resumo da Steam', () => {
    const { container } = noRouter(<GameTile game={jogo('a')} {...acoes} />);

    expect(screen.queryByRole('img', { name: /Nota/ })).toBeNull();
    expect(container.querySelector('[data-chip-plataforma]')).toBeNull();
    expect(container.querySelector('[data-steam-resumo]')).toBeNull();
  });

  it('com média e vínculo Steam: anel e "42 h · 12/40"', () => {
    noRouter(
      <GameTile game={jogo('a', { notaMedia: 8.3, dadosPlataforma: [steam] })} {...acoes} />,
    );

    expect(screen.getByRole('img', { name: 'Nota 8,3 de 10' })).toBeInTheDocument();
    expect(screen.getByText('42 h · 12/40')).toBeInTheDocument();
  });

  it('Editar e Remover têm nome acessível com o título e chamam o jogo certo', async () => {
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    const game = jogo('a');
    noRouter(<GameTile game={game} onEdit={onEdit} onRemove={onRemove} />);

    await userEvent.click(screen.getByRole('button', { name: 'Editar Jogo a' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remover Jogo a' }));

    expect(onEdit).toHaveBeenCalledWith(game);
    expect(onRemove).toHaveBeenCalledWith(game);
  });

  it('a densidade compacta usa a capa menor', () => {
    const { container } = noRouter(<GameTile game={jogo('a')} compacta {...acoes} />);

    expect(container.querySelector('[data-tile]')).toHaveClass('w-[108px]', 'md:w-[120px]');
  });
});

describe('Ações do tile só com hover (CA-18)', () => {
  const css = readFileSync('src/styles/index.css', 'utf-8');

  it('sem hover as ações somem (display: none) e os efeitos ficam dentro de @media (hover: hover)', () => {
    expect(css).toContain('.tile-acoes {\n    display: none;');
    const bloco = css.slice(css.indexOf('@media (hover: hover)'));
    expect(bloco).toContain('.tile:hover .tile-acoes');
    expect(bloco).toContain('.tile:focus-within .tile-acoes');
    expect(bloco).toContain('translateY(-6px)');
  });
});

describe('Prateleira (CA-13, CA-14)', () => {
  it('lista rotulada pelo nome, contador, um tile por jogo e o "Adicionar" da prateleira', async () => {
    const onAdicionar = vi.fn();
    const jogos = [jogo('a'), jogo('b')];
    noRouter(
      <Prateleira
        status="JOGANDO"
        titulo="Jogando agora"
        icone="sports_esports"
        jogos={jogos}
        onEdit={vi.fn()}
        onRemove={vi.fn()}
        onAdicionar={onAdicionar}
      />,
    );

    const lista = screen.getByRole('list', { name: 'Jogando agora' });
    expect(screen.getByRole('heading', { name: 'Jogando agora' })).toBeInTheDocument();
    expect(within(lista).getAllByRole('link')).toHaveLength(2);
    expect(screen.getByText('2')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Adicionar em Jogando agora' }));
    expect(onAdicionar).toHaveBeenCalledWith<[GameStatus]>('JOGANDO');
  });
});

describe('DestaqueContinue (CA-22 a CA-26)', () => {
  it('título, chips da Steam e o link "Ver detalhes" para o jogo', () => {
    noRouter(
      <DestaqueContinue
        game={jogo('a', {
          titulo: 'Hollow',
          plataforma: 'PC',
          notaMedia: 9,
          dadosPlataforma: [steam],
        })}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Hollow' })).toBeInTheDocument();
    expect(screen.getByText('Continue de onde parou')).toBeInTheDocument();
    expect(screen.getByText('12/40 conquistas')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver detalhes' })).toHaveAttribute('href', '/jogos/a');
  });

  it('sem imagem: fundo gerado com as iniciais; sem vínculo, sem chips de horas e conquistas', () => {
    const { container } = noRouter(
      <DestaqueContinue game={jogo('a', { titulo: 'Hollow Knight' })} />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(screen.queryByText(/conquistas/)).toBeNull();
    expect(container.textContent).toContain('HK');
  });

  it('o título nunca encolhe e o link do celular cobre o cartão (a coluna só é posicionada no desktop)', () => {
    const { container } = noRouter(
      <DestaqueContinue game={jogo('a', { titulo: 'Hollow', dadosPlataforma: [steam] })} />,
    );

    expect(screen.getByRole('heading', { name: 'Hollow' })).toHaveClass('shrink-0');
    const coluna = screen.getByRole('heading', { name: 'Hollow' }).parentElement;
    expect(coluna).toHaveClass('md:relative');
    expect(coluna).not.toHaveClass('relative');
    expect(container.querySelector('section')).toHaveClass('relative', 'isolate');
    expect(screen.getByRole('link', { name: 'Ver detalhes' })).toHaveClass('absolute', 'inset-0');
  });

  it('no celular as horas e as conquistas vêm curtas ("42 h 30 min", "12/40") e sem o chip da plataforma', () => {
    noRouter(
      <DestaqueContinue
        game={jogo('a', { plataforma: 'PC', notaMedia: 9, dadosPlataforma: [steam] })}
      />,
    );

    expect(screen.getByText('42 h 30 min na Steam')).toHaveClass('max-md:hidden');
    expect(screen.getByText('42 h 30 min')).toHaveClass('md:hidden');
    expect(screen.getByText('12/40')).toHaveClass('md:hidden');
    expect(screen.getByText('PC').closest('span.chip-escuro')).toHaveClass('max-md:hidden');
  });

  it('com capa enviada, ela é o fundo', () => {
    const { container } = noRouter(
      <DestaqueContinue game={jogo('a', { capaUrl: 'https://exemplo.com/c.jpg' })} />,
    );

    expect(container.querySelector('img')).toHaveAttribute('src', 'https://exemplo.com/c.jpg');
  });
});

describe('StatusFilter em pílulas (CA-12)', () => {
  const counts = { total: 5, JOGANDO: 2, QUERO_JOGAR: 2, ZERADO: 1 };

  it('quatro botões com contagem; só o ativo tem aria-pressed', async () => {
    const onChange = vi.fn();
    render(<StatusFilter filter="JOGANDO" counts={counts} onChange={onChange} />);

    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.getByRole('button', { name: /Jogando/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Todos/ })).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(screen.getByRole('button', { name: /Zerado/ }));
    expect(onChange).toHaveBeenCalledWith('ZERADO');
  });
});

describe('ListLoading (CA-28)', () => {
  it('é o esqueleto de uma prateleira: status ocupado com quatro capas em pé, sem spinner', () => {
    const { container } = render(<ListLoading />);

    expect(screen.getByRole('status', { name: 'Carregando jogos' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(container.querySelectorAll('[class*="aspect-"]')).toHaveLength(4);
    expect(container.querySelector('.gira')).toBeNull();
  });
});
