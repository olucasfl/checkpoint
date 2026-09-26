import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { storage } from '@/shared/lib/storage/storage';
import { SecaoRecolhivel } from './SecaoRecolhivel';

const secao = (aberta: boolean, chave = 'teste') => (
  <SecaoRecolhivel
    chave={chave}
    abertaPorPadrao={aberta}
    dataSecao="teste"
    titulo={<h2>Título</h2>}
    resumo="Resumo da linha"
  >
    <p>Conteúdo</p>
  </SecaoRecolhivel>
);

beforeEach(() => storage.raw.removeAllWithPrefix('checkpoint:'));

describe('SecaoRecolhivel', () => {
  it('mostra o título e o resumo mesmo fechada', () => {
    const { container } = render(secao(false));
    expect(container.querySelector('details')).not.toHaveAttribute('open');
    expect(screen.getByRole('heading', { name: 'Título' })).toBeInTheDocument();
    expect(screen.getByText('Resumo da linha')).toBeInTheDocument();
  });

  it('o padrão vale sem nada guardado; clicar abre e fecha', async () => {
    const { container } = render(secao(true));
    const details = container.querySelector('details')!;
    expect(details).toHaveAttribute('open');
    await userEvent.click(container.querySelector('summary')!);
    expect(details).not.toHaveAttribute('open');
    await userEvent.click(container.querySelector('summary')!);
    expect(details).toHaveAttribute('open');
  });

  it('o estado fica neste aparelho: uma nova montagem abre como a pessoa deixou', async () => {
    const primeira = render(secao(true, 'lembrada'));
    await userEvent.click(primeira.container.querySelector('summary')!);
    primeira.unmount();

    const segunda = render(secao(true, 'lembrada'));
    expect(segunda.container.querySelector('details')).not.toHaveAttribute('open');
    expect(storage.raw.get('checkpoint:secoes-do-jogo')).toContain('"lembrada":false');
  });

  it('não grava nada só por montar (o padrão não vira preferência)', () => {
    render(secao(true, 'so-montou'));
    expect(storage.raw.get('checkpoint:secoes-do-jogo')).toBeNull();
  });

  it('valor guardado corrompido: volta ao padrão, sem erro', () => {
    storage.raw.set('checkpoint:secoes-do-jogo', JSON.stringify({ x: 5 }));
    const { container } = render(secao(true, 'x'));
    expect(container.querySelector('details')).toHaveAttribute('open');
  });

  it('armazenamento que lança: abre no padrão e continua funcionando', async () => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.getItem = () => {
      throw new Error('bloqueado');
    };
    Storage.prototype.setItem = () => {
      throw new Error('bloqueado');
    };
    try {
      const { container } = render(secao(false, 'bloqueado'));
      expect(container.querySelector('details')).not.toHaveAttribute('open');
      await userEvent.click(container.querySelector('summary')!);
      expect(container.querySelector('details')).toHaveAttribute('open');
    } finally {
      Storage.prototype.getItem = getItem;
      Storage.prototype.setItem = setItem;
    }
  });

  it('o summary é o controle da seção, com a seta decorativa', () => {
    const { container } = render(secao(false));
    const summary = container.querySelector('summary')!;
    expect(summary).toHaveTextContent('Título');
    expect(summary.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});
