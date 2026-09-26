import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError, type AxiosResponse } from 'axios';
import { type Game } from '@checkpoint/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gamesApi } from '../api/games-api';
import { OFFLINE_NOT_SAVED } from '../lib/api-error';
import { GameForm } from './GameForm';

// Só a camada de API é falsa: o saveGame, os hooks e o formulário rodam de verdade.
// Sem conta Steam nestes testes: a API de integrações não vai à rede.
vi.mock('@/features/integracoes/api/integracoes-api', () => ({
  integracoesApi: { listarContas: vi.fn().mockResolvedValue([]) },
}));
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
  notas: { gameplay: 7, historia: null, graficos: null, trilhaSonora: null, performance: null },
  notaMedia: 7,
  descricao: null,
  capaUrl: null,
  criadoEm: '2026-09-23T12:00:00.000Z',
  dadosPlataforma: [],
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

const save = () => screen.getByRole('button', { name: 'Salvar' });
const cover = () => screen.getByLabelText('Arquivo da capa');

beforeEach(() => {
  vi.resetAllMocks();
});

const criterio = (rotulo: string) => screen.getByLabelText(rotulo);
const slider = (rotulo: string) => screen.getByLabelText(`${rotulo}, controle deslizante`);
const limpar = (rotulo: string) => screen.getByRole('button', { name: `Limpar ${rotulo}` });
const ROTULOS = ['Gameplay', 'História', 'Gráficos', 'Trilha sonora', 'Performance técnica'];
const CHAVES = ['gameplay', 'historia', 'graficos', 'trilhaSonora', 'performance'] as const;

/** O corpo completo enviado: cada critério aparece sempre, `null` quando sem nota. */
const corpo = (overrides: Record<string, unknown> = {}) => ({
  titulo: 'Hades',
  status: 'JOGANDO',
  plataforma: null,
  gameplay: null,
  historia: null,
  graficos: null,
  trilhaSonora: null,
  performance: null,
  descricao: null,
  ...overrides,
});

describe('cabeçalho, status e rodapé do formulário novo (CA-48, CA-51)', () => {
  it('o título é "Novo jogo" e o rodapé tem Cancelar e Salvar de 52 px', () => {
    renderForm();

    expect(screen.getByRole('heading', { name: 'Novo jogo' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveClass('size-11');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveClass('h-[52px]');
    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveClass('h-[52px]');
  });

  it('o status tem três botões na ordem Jogando, Quero jogar, Zerado, de 52 px, com exatamente um pressionado', () => {
    renderForm();

    const grupo = screen.getByRole('group', { name: 'Status' });
    const botoes = within(grupo).getAllByRole('button');
    expect(botoes).toHaveLength(3);
    ['Jogando', 'Quero jogar', 'Zerado'].forEach((nome, i) =>
      expect(botoes[i]).toHaveAccessibleName(nome),
    );
    for (const botao of botoes) {
      expect(botao).toHaveClass('h-[52px]');
    }
    expect(botoes.filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });

  it('a miniatura da capa é em pé, 56 px de largura', () => {
    renderForm();

    expect(document.querySelector('[data-cover="generated"]')).toHaveClass('w-14', 'aspect-[3/4]');
  });
});

describe('seção Avaliação (CA-16)', () => {
  it('em Quero jogar (o padrão de um jogo novo) a seção não existe', () => {
    renderForm();

    expect(screen.queryByRole('group', { name: 'Avaliação' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Gameplay')).not.toBeInTheDocument();
  });

  it('com Zerado ou Jogando mostra os cinco critérios: rótulo, descrição, slider, campo e Limpar', async () => {
    const { user } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Jogando' }));

    const secao = screen.getByRole('group', { name: 'Avaliação' });
    for (const rotulo of ROTULOS) {
      expect(criterio(rotulo)).toBeInTheDocument();
      expect(slider(rotulo)).toBeInTheDocument();
      expect(limpar(rotulo)).toBeInTheDocument();
    }
    expect(secao).toHaveTextContent('Jogabilidade, controles, mecânicas');
    expect(secao).toHaveTextContent('Estabilidade, desempenho, bugs');
    await user.click(screen.getByRole('button', { name: 'Zerado' }));
    expect(screen.getByRole('group', { name: 'Avaliação' })).toBeInTheDocument();
  });

  it('voltar para Quero jogar esconde a seção', async () => {
    const { user } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Jogando' }));
    await user.click(screen.getByRole('button', { name: 'Quero jogar' }));

    expect(screen.queryByRole('group', { name: 'Avaliação' })).not.toBeInTheDocument();
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

describe('"sem nota" é diferente de 0 (CA-17)', () => {
  it('um jogo novo em Jogando começa com os cinco campos vazios e o slider "sem nota"', async () => {
    const { user } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Jogando' }));

    for (const rotulo of ROTULOS) {
      expect(criterio(rotulo)).toHaveValue('');
      expect(slider(rotulo)).toHaveAttribute('aria-valuetext', 'sem nota');
      expect(limpar(rotulo)).toBeDisabled();
    }
  });

  it('soltar o slider onde ele já está (0) dá nota 0, e o envio leva gameplay: 0', async () => {
    api.create.mockResolvedValue(game());
    const { user } = renderForm();
    await user.type(screen.getByLabelText('Título'), 'Hades');
    await user.click(screen.getByRole('button', { name: 'Jogando' }));

    fireEvent.pointerUp(slider('Gameplay'));

    expect(criterio('Gameplay')).toHaveValue('0');
    expect(slider('Gameplay')).toHaveAttribute('aria-valuetext', '0,0');
    await user.click(save());
    expect(api.create).toHaveBeenCalledWith(corpo({ gameplay: 0 }));
  });

  it('Limpar volta a "sem nota": campo vazio e o envio leva gameplay: null', async () => {
    api.create.mockResolvedValue(game());
    const { user } = renderForm();
    await user.type(screen.getByLabelText('Título'), 'Hades');
    await user.click(screen.getByRole('button', { name: 'Jogando' }));
    await user.type(criterio('Gameplay'), '6');
    expect(limpar('Gameplay')).toBeEnabled();

    await user.click(limpar('Gameplay'));

    expect(criterio('Gameplay')).toHaveValue('');
    expect(slider('Gameplay')).toHaveAttribute('aria-valuetext', 'sem nota');
    await user.click(save());
    expect(api.create).toHaveBeenCalledWith(corpo({ gameplay: null }));
  });
});

describe('slider e campo sincronizados, vírgula e ponto (CA-18)', () => {
  it.each(['8,7', '8.7'])(
    'digitar %s leva o slider a 8,7 e envia o número 8.7',
    async (digitado) => {
      api.create.mockResolvedValue(game());
      const { user } = renderForm();
      await user.type(screen.getByLabelText('Título'), 'Hades');
      await user.click(screen.getByRole('button', { name: 'Jogando' }));

      await user.type(criterio('Gráficos'), digitado);

      expect(slider('Gráficos')).toHaveValue('8.7');
      expect(slider('Gráficos')).toHaveAttribute('aria-valuetext', '8,7');
      await user.click(save());
      expect(api.create).toHaveBeenCalledWith(corpo({ graficos: 8.7 }));
    },
  );

  it('mover o slider para 8,7 mostra "8,7" (vírgula) no campo', async () => {
    api.create.mockResolvedValue(game());
    const { user } = renderForm();
    await user.type(screen.getByLabelText('Título'), 'Hades');
    await user.click(screen.getByRole('button', { name: 'Jogando' }));

    fireEvent.change(slider('Trilha sonora'), { target: { value: '8.7' } });

    expect(criterio('Trilha sonora')).toHaveValue('8,7');
    await user.click(save());
    expect(api.create).toHaveBeenCalledWith(corpo({ trilhaSonora: 8.7 }));
  });

  it('o slider é nativo, de 0 a 10 com passo 0,1', async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole('button', { name: 'Jogando' }));

    const range = slider('Gameplay');
    expect(range).toHaveAttribute('type', 'range');
    expect(range).toHaveAttribute('min', '0');
    expect(range).toHaveAttribute('max', '10');
    expect(range).toHaveAttribute('step', '0.1');
  });

  it('todo controle da seção tem pelo menos 44 px (classe min-h-11 / h-11)', async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole('button', { name: 'Jogando' }));

    for (const rotulo of ROTULOS) {
      expect(criterio(rotulo).className).toContain('min-h-11');
      expect(limpar(rotulo).className).toContain('min-h-11');
      expect(limpar(rotulo).className).toContain('min-w-11');
      expect(slider(rotulo).className).toContain('h-11');
    }
  });
});

describe('média ao vivo (CA-19)', () => {
  const media = () => document.querySelector('[data-media]') as HTMLElement;

  it('mostra a média do que já foi preenchido, recalcula ao limpar e "—" sem nenhum', async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole('button', { name: 'Jogando' }));
    expect(media()).toHaveTextContent('—');

    await user.type(criterio('Gameplay'), '9');
    await user.type(criterio('História'), '8,5');
    expect(media()).toHaveTextContent('8,8');

    await user.click(limpar('História'));
    expect(media()).toHaveTextContent('9,0');

    await user.click(limpar('Gameplay'));
    expect(media()).toHaveTextContent('—');
  });

  it('0 entra na média (é nota); sem nota não', async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole('button', { name: 'Jogando' }));

    await user.type(criterio('Gameplay'), '10');
    await user.type(criterio('Gráficos'), '0');

    expect(media()).toHaveTextContent('5,0');
  });
});

describe('erros de digitação e da API (CA-20)', () => {
  it.each(['10,5', '7,55', '-1', 'abc', '1,2,3'])(
    'o valor %s mostra o erro do critério na hora e o envio não sai',
    async (digitado) => {
      const { user } = renderForm();
      await user.type(screen.getByLabelText('Título'), 'Hades');
      await user.click(screen.getByRole('button', { name: 'Jogando' }));

      await user.type(criterio('Gráficos'), digitado);

      const erro = await screen.findByText(
        'A nota de Gráficos deve ser um número de 0 a 10, com no máximo 1 casa decimal',
      );
      expect(erro.id).toBe('f-nota-graficos-err');
      expect(criterio('Gráficos')).toHaveAttribute('aria-invalid', 'true');

      await user.click(save());
      expect(api.create).not.toHaveBeenCalled();
    },
  );

  it('o erro some quando o valor volta a ser válido', async () => {
    const { user } = renderForm();
    await user.click(screen.getByRole('button', { name: 'Jogando' }));

    await user.type(criterio('Gameplay'), '11');
    expect(screen.getByText(/A nota de Gameplay deve ser/)).toBeInTheDocument();

    await user.clear(criterio('Gameplay'));
    await user.type(criterio('Gameplay'), '10');
    expect(screen.queryByText(/A nota de Gameplay deve ser/)).not.toBeInTheDocument();
  });

  it('fields.notas da API (Zerado sem critério) aparece na seção Avaliação', async () => {
    api.create.mockRejectedValue(
      httpError(400, {
        statusCode: 400,
        message: 'x',
        fields: { notas: 'Preencha ao menos um critério para marcar como Zerado' },
      }),
    );
    const { user } = renderForm();
    await user.type(screen.getByLabelText('Título'), 'Hades');
    await user.click(screen.getByRole('button', { name: 'Zerado' }));
    await user.click(save());

    const erro = await screen.findByText('Preencha ao menos um critério para marcar como Zerado');
    expect(erro.id).toBe('f-notas-err');
    expect(screen.getByRole('group', { name: 'Avaliação' })).toContainElement(erro);
  });
});

describe('mudar para Quero jogar com notas preenchidas (CA-21)', () => {
  it('avisa, e o PATCH leva null em cada critério', async () => {
    api.update.mockResolvedValue(game({ status: 'QUERO_JOGAR' }));
    const { user } = renderForm({ game: game({ status: 'JOGANDO' }) });
    expect(criterio('Gameplay')).toHaveValue('7');

    await user.click(screen.getByRole('button', { name: 'Quero jogar' }));

    expect(screen.getByRole('status')).toHaveTextContent(
      'As notas preenchidas serão apagadas ao salvar como Quero jogar.',
    );
    expect(screen.queryByRole('group', { name: 'Avaliação' })).not.toBeInTheDocument();
    await user.click(save());
    expect(api.update).toHaveBeenCalledWith(
      'g1',
      corpo({ titulo: 'Hollow Knight', status: 'QUERO_JOGAR', plataforma: 'PC' }),
    );
  });

  it('sem notas preenchidas não há aviso, e um jogo novo em Quero jogar envia tudo null', async () => {
    api.create.mockResolvedValue(game({ status: 'QUERO_JOGAR' }));
    const { user, onDone } = renderForm();

    await user.type(screen.getByLabelText('Título'), 'Hades');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await user.click(save());

    expect(api.create).toHaveBeenCalledWith(corpo({ status: 'QUERO_JOGAR' }));
    expect(onDone).toHaveBeenCalled();
  });

  it('desistir (voltar para Jogando) recupera as notas digitadas', async () => {
    const { user } = renderForm({ game: game({ status: 'JOGANDO' }) });

    await user.click(screen.getByRole('button', { name: 'Quero jogar' }));
    await user.click(screen.getByRole('button', { name: 'Jogando' }));

    expect(criterio('Gameplay')).toHaveValue('7');
  });
});

describe('envio das notas', () => {
  it('editar só o título de um Zerado sem notas manda o corpo completo, com os critérios null (CA-32)', async () => {
    api.update.mockResolvedValue(game({ status: 'ZERADO' }));
    const semNotas = game({
      status: 'ZERADO',
      notas: {
        gameplay: null,
        historia: null,
        graficos: null,
        trilhaSonora: null,
        performance: null,
      },
      notaMedia: null,
    });
    const { user } = renderForm({ game: semNotas });

    await user.type(screen.getByLabelText('Título'), ' 2');
    await user.click(save());

    expect(api.update).toHaveBeenCalledWith(
      'g1',
      corpo({ titulo: 'Hollow Knight 2', status: 'ZERADO', plataforma: 'PC' }),
    );
  });

  it('as notas dos cinco critérios vão como número, cada uma na sua chave', async () => {
    api.create.mockResolvedValue(game());
    const { user } = renderForm();
    await user.type(screen.getByLabelText('Título'), 'Hades');
    await user.click(screen.getByRole('button', { name: 'Zerado' }));

    const valores = ['9,2', '8', '7,5', '10', '0'];
    for (const [i, rotulo] of ROTULOS.entries()) {
      await user.type(criterio(rotulo), valores[i] ?? '');
    }
    await user.click(save());

    expect(api.create).toHaveBeenCalledWith(
      corpo({
        status: 'ZERADO',
        gameplay: 9.2,
        historia: 8,
        graficos: 7.5,
        trilhaSonora: 10,
        performance: 0,
      }),
    );
    expect(Object.keys(api.create.mock.calls[0]?.[0] ?? {})).toEqual(
      expect.arrayContaining([...CHAVES]),
    );
  });
});

describe('Descrição (CA-22)', () => {
  const descricao = () => screen.getByLabelText(/Descrição/);

  it('o contador mostra n/1000 e o campo não passa de 1000', async () => {
    const { user } = renderForm();
    expect(screen.getByText('0/1000')).toBeInTheDocument();

    await user.type(descricao(), 'abc');
    expect(screen.getByText('3/1000')).toBeInTheDocument();

    expect(descricao()).toHaveAttribute('maxlength', '1000');
  });

  it('as quebras de linha vão no corpo e voltam ao reabrir o formulário', async () => {
    api.create.mockResolvedValue(game());
    const { user } = renderForm();
    await user.type(screen.getByLabelText('Título'), 'Hades');

    await user.type(descricao(), 'Linha 1{Enter}{Enter}Linha 3');
    await user.click(save());

    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({ descricao: 'Linha 1\n\nLinha 3' }),
    );
  });

  it('um jogo com descrição abre o formulário com o texto e as mesmas quebras', () => {
    renderForm({ game: game({ descricao: 'Ótimo\n\njogo' }) });

    expect(descricao()).toHaveValue('Ótimo\n\njogo');
    expect(screen.getByText('11/1000')).toBeInTheDocument();
  });

  it('só espaços vão como null', async () => {
    api.create.mockResolvedValue(game());
    const { user } = renderForm();
    await user.type(screen.getByLabelText('Título'), 'Hades');

    await user.type(descricao(), '   ');
    await user.click(save());

    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ descricao: null }));
  });

  it('o erro da API em fields.descricao aparece junto do campo', async () => {
    api.create.mockRejectedValue(
      httpError(400, {
        statusCode: 400,
        message: 'x',
        fields: { descricao: 'A descrição deve ter no máximo 1000 caracteres' },
      }),
    );
    const { user } = renderForm();
    await user.type(screen.getByLabelText('Título'), 'Hades');
    await user.click(save());

    const erro = await screen.findByText('A descrição deve ter no máximo 1000 caracteres');
    expect(erro.id).toBe('f-descricao-err');
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

  it('400 de um critério aparece junto do campo daquele critério', async () => {
    api.create.mockRejectedValue(
      httpError(400, {
        statusCode: 400,
        message: 'x',
        fields: {
          historia: 'A nota de História deve ser um número de 0 a 10, com no máximo 1 casa decimal',
        },
      }),
    );
    const { user } = renderForm();

    await user.type(screen.getByLabelText('Título'), 'Hades');
    await user.click(screen.getByRole('button', { name: 'Jogando' }));
    await user.click(save());

    const message = await screen.findByText(/A nota de História deve ser/);
    expect(message.id).toBe('f-nota-historia-err');
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
  it('avisa que a capa aparece em pé (3:4) e que outra proporção é cortada no centro (CA-40)', () => {
    renderForm();

    expect(
      screen.getByText(
        'A capa aparece em pé (3:4); imagens de outra proporção são cortadas no centro.',
      ),
    ).toBeInTheDocument();
  });

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
    expect(screen.getByRole('heading', { name: 'Editar jogo' })).toBeInTheDocument();
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

    expect(screen.getByRole('button', { name: 'Remover capa' })).toBeDisabled();
  });

  it('remover a capa de um jogo que a tem chama DELETE /capa ao salvar (CA-78)', async () => {
    const withCover = game({ capaUrl: 'https://s/capas/g1/a.png' });
    api.update.mockResolvedValue(withCover);
    api.removeCover.mockResolvedValue(game({ capaUrl: null }));
    const { user, onDone } = renderForm({ game: withCover });

    await user.click(screen.getByRole('button', { name: 'Remover capa' }));
    expect(api.removeCover).not.toHaveBeenCalled(); // só vale ao Salvar
    await user.click(save());

    expect(api.removeCover).toHaveBeenCalledWith('g1');
    expect(onDone).toHaveBeenCalled();
  });

  it('cancelar depois de marcar "Remover capa" descarta: nada é chamado (CA-78)', async () => {
    const { user, onCancel } = renderForm({
      game: game({ capaUrl: 'https://s/capas/g1/a.png' }),
    });

    await user.click(screen.getByRole('button', { name: 'Remover capa' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCancel).toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
    expect(api.removeCover).not.toHaveBeenCalled();
  });

  it('"Remover capa" com um arquivo escolhido só descarta o arquivo', async () => {
    const { user } = renderForm();

    await user.upload(cover(), png());
    await user.click(screen.getByRole('button', { name: 'Remover capa' }));

    expect(screen.queryByAltText('Prévia da capa selecionada')).not.toBeInTheDocument();
    expect(api.removeCover).not.toHaveBeenCalled();
  });
});
