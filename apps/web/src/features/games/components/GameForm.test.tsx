import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { type Game } from '@checkpoint/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gamesApi } from '../api/games-api';
import { OFFLINE_NOT_SAVED } from '../lib/api-error';
import { GameForm } from './GameForm';

// Só a camada de API é falsa: o saveGame, os hooks e o formulário rodam de verdade.
vi.mock('../api/games-api', () => ({
  gamesApi: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    uploadCover: vi.fn(),
    removeCover: vi.fn(),
  },
}));

const api = vi.mocked(gamesApi);

const game = (overrides: Partial<Game> = {}): Game => ({
  id: 'g1',
  titulo: 'Hollow Knight',
  plataforma: 'PC',
  status: 'JOGANDO',
  nota: 7,
  capaUrl: null,
  criadoEm: '2026-09-23T12:00:00.000Z',
  atualizadoEm: '2026-09-23T12:00:00.000Z',
  ...overrides,
});

function httpError(status: number, data: unknown): AxiosError {
  const response = { status, data, statusText: '', headers: {}, config: {} } as AxiosResponse;
  return new AxiosError('falhou', 'ERR_BAD_REQUEST', undefined, undefined, response);
}

const png = (bytes = 100) => new File([new Uint8Array(bytes)], 'capa.png', { type: 'image/png' });

function renderForm(props: { game?: Game } = {}) {
  const onDone = vi.fn();
  const onCancel = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <GameForm game={props.game} onDone={onDone} onCancel={onCancel} />
    </QueryClientProvider>,
  );
  // O seletor de arquivo real filtra por `accept`; aqui queremos poder mandar um GIF.
  return { onDone, onCancel, user: userEvent.setup({ applyAccept: false }) };
}

const save = () => screen.getByRole('button', { name: 'SALVAR' });
const cover = () => screen.getByLabelText('Arquivo da capa');

beforeEach(() => {
  vi.resetAllMocks();
});

describe('nota bloqueada em "Quero jogar" (CA-43, CA-82)', () => {
  it('ao escolher "Quero jogar" a nota fica desabilitada, vazia e com o cadeado', async () => {
    const { user } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Zerado' }));
    await user.type(screen.getByLabelText('Nota'), '8');
    expect(screen.getByLabelText('Nota')).toHaveValue(8);

    await user.click(screen.getByRole('button', { name: 'Quero jogar' }));

    const nota = screen.getByLabelText('Nota');
    expect(nota).toBeDisabled();
    expect(nota).toHaveValue(null);
    expect(screen.getByText('Disponível para Zerado ou Jogando')).toBeInTheDocument();
    expect(document.querySelector('[data-locked="true"]')).not.toBeNull();
  });

  it('voltar para Jogando reabilita a nota', async () => {
    const { user } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Jogando' }));

    expect(screen.getByLabelText('Nota')).toBeEnabled();
  });

  it('o status são três botões com aria-pressed e exatamente um ativo', async () => {
    const { user } = renderForm();
    const active = () => screen.getAllByRole('button', { pressed: true });

    expect(active()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Quero jogar', pressed: true })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Jogando' }));

    expect(active()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Jogando', pressed: true })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { pressed: false })).toHaveLength(2);
  });
});

describe('envio de nota: null (CA-43)', () => {
  it('jogo novo em "Quero jogar" envia nota: null', async () => {
    api.create.mockResolvedValue(game({ status: 'QUERO_JOGAR', nota: null }));
    const { user, onDone } = renderForm();

    await user.type(screen.getByLabelText('Título'), 'Hades');
    await user.click(save());

    expect(api.create).toHaveBeenCalledWith({
      titulo: 'Hades',
      status: 'QUERO_JOGAR',
      plataforma: null,
      nota: null,
    });
    expect(onDone).toHaveBeenCalled();
  });

  it('editar um jogo com nota para "Quero jogar" manda PATCH com nota: null explícito', async () => {
    api.update.mockResolvedValue(game({ status: 'QUERO_JOGAR', nota: null }));
    const { user } = renderForm({ game: game({ status: 'JOGANDO', nota: 7 }) });

    await user.click(screen.getByRole('button', { name: 'Quero jogar' }));
    await user.click(save());

    expect(api.update).toHaveBeenCalledWith('g1', {
      titulo: 'Hollow Knight',
      status: 'QUERO_JOGAR',
      plataforma: 'PC',
      nota: null,
    });
  });

  it('com Jogando envia a nota digitada como número', async () => {
    api.create.mockResolvedValue(game());
    const { user } = renderForm();

    await user.type(screen.getByLabelText('Título'), 'Celeste');
    await user.click(screen.getByRole('button', { name: 'Jogando' }));
    await user.type(screen.getByLabelText('Nota'), '9');
    await user.click(save());

    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'JOGANDO', nota: 9 }),
    );
  });
});

describe('plataforma: seleção das mais usadas (CA-91)', () => {
  const platformSelect = () => screen.getByLabelText(/Plataforma/) as HTMLSelectElement;

  it('é uma seleção com "Sem plataforma" como primeira opção e padrão', () => {
    renderForm();

    expect(platformSelect().tagName).toBe('SELECT');
    expect(platformSelect()).toHaveValue('');
    expect(platformSelect().options[0]).toHaveTextContent('Sem plataforma');
  });

  it.each([
    'PC',
    'Nintendo 64',
    'Nintendo Switch',
    'PS3',
    'PS4',
    'PS5',
    'Xbox 360',
    'Xbox One',
    'Super Nintendo',
    'Android',
  ])('oferece %s', (platform) => {
    renderForm();

    const options = Array.from(platformSelect().options).map((option) => option.value);
    expect(options).toContain(platform);
  });

  it('agrupa as opções por família (optgroup)', () => {
    renderForm();

    const groups = Array.from(platformSelect().querySelectorAll('optgroup')).map((g) => g.label);
    expect(groups).toEqual(
      expect.arrayContaining(['Computador', 'PlayStation', 'Xbox', 'Nintendo']),
    );
  });

  it('a plataforma escolhida vai exatamente como está na lista para a API', async () => {
    api.create.mockResolvedValue(game());
    const { user } = renderForm();

    await user.type(screen.getByLabelText('Título'), 'Zelda');
    await user.selectOptions(platformSelect(), 'Nintendo Switch');
    await user.click(save());

    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ titulo: 'Zelda', plataforma: 'Nintendo Switch' }),
    );
  });

  it('sem escolher plataforma, envia plataforma: null', async () => {
    api.create.mockResolvedValue(game());
    const { user } = renderForm();

    await user.type(screen.getByLabelText('Título'), 'Zelda');
    await user.click(save());

    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ plataforma: null }));
  });

  it('um jogo com plataforma antiga fora da lista a mantém selecionada na edição', async () => {
    api.update.mockResolvedValue(game({ plataforma: 'Atari 2600' }));
    const { user } = renderForm({ game: game({ plataforma: 'Atari 2600' }) });

    expect(platformSelect()).toHaveValue('Atari 2600');
    await user.click(save());

    expect(api.update).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({ plataforma: 'Atari 2600' }),
    );
  });

  it('dá para trocar a plataforma de um jogo existente e voltar para "Sem plataforma"', async () => {
    api.update.mockResolvedValue(game());
    const { user } = renderForm({ game: game({ plataforma: 'PC' }) });

    await user.selectOptions(platformSelect(), '');
    await user.click(save());

    expect(api.update).toHaveBeenCalledWith('g1', expect.objectContaining({ plataforma: null }));
  });
});

describe('erros da API no campo certo (CA-44)', () => {
  it('409 mostra a mensagem junto do campo Título e mantém o diálogo aberto com os dados', async () => {
    api.create.mockRejectedValue(
      httpError(409, {
        statusCode: 409,
        message: 'Já existe esse jogo nesta plataforma',
        fields: { titulo: 'Já existe esse jogo nesta plataforma' },
      }),
    );
    const { user, onDone } = renderForm();

    await user.type(screen.getByLabelText('Título'), 'celeste');
    await user.selectOptions(screen.getByLabelText(/Plataforma/), 'PC');
    await user.click(save());

    const message = await screen.findByText('Já existe esse jogo nesta plataforma');
    const titulo = screen.getByLabelText('Título');
    expect(titulo).toHaveAttribute('aria-invalid', 'true');
    expect(titulo).toHaveAttribute('aria-describedby', message.id);
    expect(message).toHaveAttribute('role', 'alert');
    expect(titulo).toHaveValue('celeste');
    expect(screen.getByLabelText(/Plataforma/)).toHaveValue('PC');
    expect(onDone).not.toHaveBeenCalled();
  });

  it('o erro some quando o usuário volta a digitar no campo', async () => {
    api.create.mockRejectedValue(
      httpError(409, { statusCode: 409, message: 'dup', fields: { titulo: 'dup' } }),
    );
    const { user } = renderForm();

    await user.type(screen.getByLabelText('Título'), 'x');
    await user.click(save());
    await screen.findByText('dup');
    await user.type(screen.getByLabelText('Título'), 'y');

    expect(screen.queryByText('dup')).not.toBeInTheDocument();
  });

  it('400 da regra da nota aparece junto do campo Nota', async () => {
    api.create.mockRejectedValue(
      httpError(400, {
        statusCode: 400,
        message: 'x',
        fields: { nota: 'Nota só pode ser preenchida quando o status é Zerado ou Jogando' },
      }),
    );
    const { user } = renderForm();

    await user.type(screen.getByLabelText('Título'), 'Hades');
    await user.click(save());

    const message = await screen.findByText(/Nota só pode ser preenchida/);
    expect(message.id).toBe('f-nota-err');
  });

  it('erro sem campo (404, rede) vira mensagem geral no formulário', async () => {
    api.create.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    const { user } = renderForm();

    await user.type(screen.getByLabelText('Título'), 'Hades');
    await user.click(save());

    expect(await screen.findByText(OFFLINE_NOT_SAVED)).toHaveAttribute('role', 'alert');
  });

  it('título vazio é barrado antes de qualquer request', async () => {
    const { user } = renderForm();

    await user.click(save());

    expect(await screen.findByText('Informe o título')).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();
  });
});

describe('capa: preview, salvar o jogo e depois a capa (CA-74 a CA-78)', () => {
  it('escolher um arquivo mostra o preview e NÃO envia nada antes de Salvar (CA-74)', async () => {
    const { user } = renderForm();

    await user.upload(cover(), png());

    expect(screen.getByAltText('Prévia da capa selecionada')).toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();
    expect(api.uploadCover).not.toHaveBeenCalled();
  });

  it('jogo novo com capa: POST e depois PUT da capa; o diálogo fecha (CA-75)', async () => {
    api.create.mockResolvedValue(game());
    api.uploadCover.mockResolvedValue(game({ capaUrl: 'https://s/capas/g1/a.png' }));
    const { user, onDone } = renderForm();

    await user.type(screen.getByLabelText('Título'), 'Hollow Knight');
    const file = png();
    await user.upload(cover(), file);
    await user.click(save());

    expect(api.uploadCover).toHaveBeenCalledWith('g1', file);
    expect(api.create.mock.invocationCallOrder[0]).toBeLessThan(
      api.uploadCover.mock.invocationCallOrder[0] as number,
    );
    expect(onDone).toHaveBeenCalled();
  });

  it('se a capa falha, o jogo fica salvo, o diálogo continua aberto e o próximo Salvar é PATCH (CA-76)', async () => {
    api.create.mockResolvedValue(game());
    api.uploadCover.mockRejectedValueOnce(
      httpError(502, {
        statusCode: 502,
        message: 'Falha ao acessar o armazenamento de capas',
        fields: { arquivo: 'Falha ao acessar o armazenamento de capas' },
      }),
    );
    const { user, onDone } = renderForm();

    await user.type(screen.getByLabelText('Título'), 'Hollow Knight');
    await user.upload(cover(), png());
    await user.click(save());

    const message = await screen.findByText('Falha ao acessar o armazenamento de capas');
    expect(message.id).toBe('f-capa-err');
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'EDITAR JOGO' })).toBeInTheDocument();
    expect(api.create).toHaveBeenCalledTimes(1);

    // Tentar de novo: PATCH no jogo já salvo (nada de POST, que daria 409) e reenvia a capa.
    api.update.mockResolvedValue(game());
    api.uploadCover.mockResolvedValue(game({ capaUrl: 'https://s/capas/g1/a.png' }));
    await user.click(save());

    expect(api.update).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({ titulo: 'Hollow Knight' }),
    );
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.uploadCover).toHaveBeenCalledTimes(2);
    expect(onDone).toHaveBeenCalled();
  });

  it('GIF e PNG de 3 MB são barrados no cliente, sem request (CA-77)', async () => {
    const { user } = renderForm();

    await user.upload(cover(), new File(['GIF89a'], 'a.gif', { type: 'image/gif' }));
    expect(
      await screen.findByText('A capa deve ser uma imagem JPEG, PNG ou WebP'),
    ).toBeInTheDocument();

    await user.upload(cover(), png(3 * 1024 * 1024));
    expect(await screen.findByText('A capa deve ter no máximo 2 MB')).toBeInTheDocument();

    expect(screen.queryByAltText('Prévia da capa selecionada')).not.toBeInTheDocument();
    expect(api.create).not.toHaveBeenCalled();
    expect(api.uploadCover).not.toHaveBeenCalled();
  });

  it('"Remover capa" fica desabilitado quando não há capa nem arquivo', () => {
    renderForm();

    expect(screen.getByRole('button', { name: 'REMOVER CAPA' })).toBeDisabled();
  });

  it('remover a capa de um jogo que a tem chama DELETE /capa ao salvar (CA-78)', async () => {
    const withCover = game({ capaUrl: 'https://s/capas/g1/a.png' });
    api.update.mockResolvedValue(withCover);
    api.removeCover.mockResolvedValue(game({ capaUrl: null }));
    const { user, onDone } = renderForm({ game: withCover });

    await user.click(screen.getByRole('button', { name: 'REMOVER CAPA' }));
    expect(api.removeCover).not.toHaveBeenCalled(); // só vale ao Salvar
    await user.click(save());

    expect(api.removeCover).toHaveBeenCalledWith('g1');
    expect(onDone).toHaveBeenCalled();
  });

  it('cancelar depois de marcar "Remover capa" descarta: nada é chamado (CA-78)', async () => {
    const { user, onCancel } = renderForm({
      game: game({ capaUrl: 'https://s/capas/g1/a.png' }),
    });

    await user.click(screen.getByRole('button', { name: 'REMOVER CAPA' }));
    await user.click(screen.getByRole('button', { name: 'CANCELAR' }));

    expect(onCancel).toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
    expect(api.removeCover).not.toHaveBeenCalled();
  });

  it('"Remover capa" com um arquivo escolhido só descarta o arquivo', async () => {
    const { user } = renderForm();

    await user.upload(cover(), png());
    await user.click(screen.getByRole('button', { name: 'REMOVER CAPA' }));

    expect(screen.queryByAltText('Prévia da capa selecionada')).not.toBeInTheDocument();
    expect(api.removeCover).not.toHaveBeenCalled();
  });
});
