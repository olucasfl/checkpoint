import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PREFS } from '@/shared/lib/prefs/prefs';
import { alterarPrefs, definirUsuario, resetPrefsForTests } from '@/shared/lib/prefs/prefs-store';
import { storage } from '@/shared/lib/storage/storage';
import { PreferenciasModal } from './PreferenciasModal';

const ANA_ID = 'u-ana';
const BIA_ID = 'u-bia';

/** Quem abre o modal na página: um botão, para conferir a volta do foco. */
function Pagina() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAberto(true)}>
        Abrir preferências
      </button>
      <PreferenciasModal open={aberto} onClose={() => setAberto(false)} />
    </>
  );
}

async function abrir() {
  const user = userEvent.setup({ applyAccept: false });
  render(<Pagina />);
  await user.click(screen.getByRole('button', { name: 'Abrir preferências' }));
  return user;
}

/** O Esc nativo do <dialog> não existe no jsdom: o navegador responde a ele com `close()`, que é o que se chama aqui. */
const esc = () => act(() => (modal() as HTMLDialogElement).close());
const modal = () => screen.getByRole('dialog', { name: 'Preferências' });
const aba = (nome: string) => within(modal()).getByRole('tab', { name: nome });
const painel = (nome: string) => within(modal()).getByRole('tabpanel', { name: nome });
const grupo = (nome: string) => within(modal()).getByRole('radiogroup', { name: nome });
const selecionada = (nome: string) =>
  within(grupo(nome)).getByRole('radio', { checked: true }).getAttribute('aria-label') ??
  within(grupo(nome)).getByRole('radio', { checked: true }).textContent;

beforeEach(() => {
  storage.raw.removeAllWithPrefix('checkpoint:');
  resetPrefsForTests();
  definirUsuario(ANA_ID);
});

describe('abas (CA-35)', () => {
  it('três abas, só a ativa com aria-selected e no Tab; abre em Aparência', async () => {
    await abrir();

    const nomes = within(modal())
      .getAllByRole('tab')
      .map((t) => t.textContent);
    expect(nomes).toEqual(['Aparência', 'Catálogo', 'Plataformas']);
    expect(aba('Aparência')).toHaveAttribute('aria-selected', 'true');
    expect(aba('Aparência')).toHaveAttribute('tabindex', '0');
    expect(aba('Catálogo')).toHaveAttribute('aria-selected', 'false');
    expect(aba('Catálogo')).toHaveAttribute('tabindex', '-1');
    expect(aba('Aparência')).toHaveFocus();
    expect(painel('Aparência')).toBeVisible();
  });

  it('as setas trocam e ativam a aba vizinha, com volta circular; Home e End vão às pontas', async () => {
    const user = await abrir();

    await user.keyboard('{ArrowRight}');
    expect(aba('Catálogo')).toHaveAttribute('aria-selected', 'true');
    expect(aba('Catálogo')).toHaveFocus();
    expect(painel('Catálogo')).toBeVisible();
    expect(modal().querySelector('#prefs-painel-aparencia')).not.toBeVisible();

    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(aba('Aparência')).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{ArrowLeft}');
    expect(aba('Plataformas')).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Home}');
    expect(aba('Aparência')).toHaveFocus();
    await user.keyboard('{End}');
    expect(aba('Plataformas')).toHaveAttribute('aria-selected', 'true');
  });

  it('Tab sai da aba ativa direto para o painel, sem passar pelas outras abas', async () => {
    const user = await abrir();

    await user.tab();

    expect(aba('Catálogo')).not.toHaveFocus();
    expect(aba('Plataformas')).not.toHaveFocus();
    expect(modal().contains(document.activeElement)).toBe(true);
  });

  it('Esc fecha, e uma nova abertura volta à aba Aparência', async () => {
    const user = await abrir();
    await user.keyboard('{ArrowRight}');

    esc();
    expect(screen.queryByRole('dialog', { name: 'Preferências' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir preferências' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Abrir preferências' }));
    expect(aba('Aparência')).toHaveAttribute('aria-selected', 'true');
  });
});

describe('aparência: prévia ao vivo (CA-36, CA-37)', () => {
  it('abre com os padrões da spec', async () => {
    await abrir();

    expect(selecionada('Cor de destaque')).toBe('Magenta');
    expect(selecionada('Densidade da lista')).toBe('Confortável');
    expect(selecionada('Efeitos visuais')).toBe('Completos');
    expect(
      within(grupo('Cor de destaque'))
        .getAllByRole('radio')
        .map((r) => r.getAttribute('aria-label')),
    ).toEqual(['Magenta', 'Violeta', 'Azul', 'Laranja']);
  });

  it('escolher Violeta muda o <html> na hora, sem Salvar e sem nenhuma request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const user = await abrir();

    await user.click(within(grupo('Cor de destaque')).getByRole('radio', { name: 'Violeta' }));

    expect(document.documentElement.dataset.destaque).toBe('violeta');
    expect(
      within(grupo('Cor de destaque')).getByRole('radio', { name: 'Violeta' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(within(modal()).queryByRole('button', { name: /salvar/i })).not.toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('fica gravada na entrada DESTE usuário; outra pessoa no mesmo navegador tem as suas', async () => {
    const user = await abrir();

    await user.click(within(grupo('Cor de destaque')).getByRole('radio', { name: 'Violeta' }));
    await user.click(within(grupo('Efeitos visuais')).getByRole('radio', { name: 'Reduzidos' }));

    const guardadas = storage.get(PREFS);
    expect(guardadas.ultimoUsuario).toBe(ANA_ID);
    expect(guardadas.porUsuario[ANA_ID]).toMatchObject({
      destaque: 'violeta',
      efeitos: 'reduzidos',
    });
    expect(document.documentElement.dataset.efeitos).toBe('reduzidos');

    definirUsuario(BIA_ID);
    expect(document.documentElement.dataset.destaque).toBe('magenta');
    definirUsuario(ANA_ID);
    expect(document.documentElement.dataset.destaque).toBe('violeta');
  });

  it('as setas trocam a cor marcada, como num grupo de rádios', async () => {
    const user = await abrir();

    within(grupo('Cor de destaque')).getByRole('radio', { name: 'Magenta' }).focus();
    await user.keyboard('{ArrowRight}');

    expect(within(grupo('Cor de destaque')).getByRole('radio', { name: 'Violeta' })).toHaveFocus();
    expect(document.documentElement.dataset.destaque).toBe('violeta');
  });

  it('densidade: a mini-prévia (duas linhas sintéticas) acompanha a escolha', async () => {
    const user = await abrir();
    const previa = () => within(modal()).getByRole('list', { name: 'Prévia da densidade' });
    expect(previa()).toHaveAttribute('data-densidade', 'confortavel');
    expect(within(previa()).getAllByRole('listitem')).toHaveLength(2);

    await user.click(within(grupo('Densidade da lista')).getByRole('radio', { name: 'Compacta' }));

    expect(previa()).toHaveAttribute('data-densidade', 'compacta');
    expect(previa().querySelector('[data-cover]')?.className).toContain('size-10');
    expect(storage.get(PREFS).porUsuario[ANA_ID]).toMatchObject({ densidade: 'compacta' });
  });

  it('efeitos: a amostra diz se orbes e scanlines estão ligados', async () => {
    const user = await abrir();
    expect(within(modal()).getByText('Orbes e scanlines ligados')).toBeInTheDocument();

    await user.click(within(grupo('Efeitos visuais')).getByRole('radio', { name: 'Reduzidos' }));

    expect(
      within(modal()).getByText('Orbes e scanlines desligados, sem animação'),
    ).toBeInTheDocument();
  });
});

describe('catálogo (CA-38)', () => {
  it('escolher Jogando grava o filtro inicial', async () => {
    const user = await abrir();

    await user.click(aba('Catálogo'));
    expect(selecionada('Filtro inicial do catálogo')).toBe('Todos');
    await user.click(
      within(grupo('Filtro inicial do catálogo')).getByRole('radio', { name: 'Jogando' }),
    );

    expect(storage.get(PREFS).porUsuario[ANA_ID]).toMatchObject({ filtroInicial: 'JOGANDO' });
  });
});

describe('plataformas: até 8 favoritas (CA-39)', () => {
  const chip = (nome: string) => within(modal()).getByRole('button', { name: nome });
  const oito = ['PC', 'PS5', 'PS4', 'Xbox One', 'Nintendo Switch', 'Wii', 'Android', 'iOS'];

  it('chips por família; a 9ª mostra "Até 8 favoritas" e não marca; desmarcar limpa o aviso', async () => {
    const user = await abrir();
    await user.click(aba('Plataformas'));
    expect(within(modal()).getByRole('group', { name: 'PlayStation' })).toBeInTheDocument();

    for (const p of oito) {
      await user.click(chip(p));
    }
    await user.click(chip('Mega Drive'));

    expect(within(modal()).getByText('Até 8 favoritas')).toBeInTheDocument();
    expect(chip('Mega Drive')).toHaveAttribute('aria-pressed', 'false');
    expect(chip('PS5')).toHaveAttribute('aria-pressed', 'true');
    expect(storage.get(PREFS).porUsuario[ANA_ID]).toMatchObject({ plataformasFavoritas: oito });

    await user.click(chip('PC'));
    expect(within(modal()).queryByText('Até 8 favoritas')).not.toBeInTheDocument();
    expect(chip('PC')).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('Restaurar padrões por aba (CA-40)', () => {
  it('só as preferências da aba ativa voltam ao padrão', async () => {
    alterarPrefs({
      destaque: 'laranja',
      densidade: 'compacta',
      efeitos: 'reduzidos',
      filtroInicial: 'ZERADO',
      plataformasFavoritas: ['PS5'],
    });
    const user = await abrir();

    await user.click(screen.getByRole('button', { name: 'Restaurar padrões' }));
    expect(storage.get(PREFS).porUsuario[ANA_ID]).toMatchObject({
      destaque: 'magenta',
      densidade: 'confortavel',
      efeitos: 'completos',
      filtroInicial: 'ZERADO',
      plataformasFavoritas: ['PS5'],
    });

    await user.click(aba('Catálogo'));
    await user.click(screen.getByRole('button', { name: 'Restaurar padrões' }));
    expect(storage.get(PREFS).porUsuario[ANA_ID]).toMatchObject({
      filtroInicial: 'TODOS',
      plataformasFavoritas: ['PS5'],
    });

    await user.click(aba('Plataformas'));
    await user.click(screen.getByRole('button', { name: 'Restaurar padrões' }));
    expect(storage.get(PREFS).porUsuario[ANA_ID]).toMatchObject({ plataformasFavoritas: [] });
  });
});
