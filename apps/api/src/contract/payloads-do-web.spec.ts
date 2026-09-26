import { type ArgumentMetadata } from '@nestjs/common';
import {
  type AtualizarPerfilRequest,
  type CreateGameRequest,
  type ExcluirContaRequest,
  type ListGamesQuery,
  type LoginRequest,
  type RegistroRequest,
  type TrocarSenhaRequest,
  type UpdateGameRequest,
  type VincularJogoRequest,
} from '@checkpoint/shared';
import { createValidationPipe } from '../common/pipes/app-validation.pipe';
import { LoginDto } from '../modules/auth/dto/login.dto';
import { RegistroDto } from '../modules/auth/dto/registro.dto';
import { TrocarSenhaDto } from '../modules/auth/dto/trocar-senha.dto';
import { CreateGameDto } from '../modules/games/dto/create-game.dto';
import { ListGamesQueryDto } from '../modules/games/dto/list-games-query.dto';
import { UpdateGameDto } from '../modules/games/dto/update-game.dto';
import { BibliotecaQueryDto } from '../modules/integrations/dto/biblioteca-query.dto';
import { VincularJogoDto } from '../modules/integrations/dto/vincular-jogo.dto';
import { AtualizarPerfilDto } from '../modules/users/dto/atualizar-perfil.dto';
import { ExcluirContaDto } from '../modules/users/dto/excluir-conta.dto';

/**
 * PAYLOADS DO WEB × VALIDAÇÃO DA API. O `ValidationPipe` global é `whitelist + forbidNonWhitelisted`: um campo a mais
 * (ou de menos) no que o web envia vira 400 na API REAL, e um mock que aceita qualquer corpo esconde isso. Cada
 * payload abaixo é tipado com o `*Request` do `@checkpoint/shared` (que o web também usa para montar o corpo, então
 * uma chave nova no shared quebra o compilador aqui) e é passado pelo MESMO pipe do `main.ts`, com o DTO da rota.
 * Os exemplos são os corpos que o web realmente envia (capturados nos fluxos de criar, editar, entrar, trocar
 * senha, ligar à Steam...), incluindo os casos de borda.
 */
const pipe = createValidationPipe();

async function passa(dto: new () => unknown, tipo: ArgumentMetadata['type'], valor: unknown) {
  return pipe.transform(valor, { type: tipo, metatype: dto });
}

const SEM_NOTAS = {
  gameplay: null,
  historia: null,
  graficos: null,
  trilhaSonora: null,
  performance: null,
} as const;

describe('POST /games (CreateGameDto)', () => {
  const casos: [string, CreateGameRequest][] = [
    [
      'Quero jogar sem plataforma e sem notas (o "Adicionar jogo" do topo)',
      {
        titulo: 'Jogo Criado',
        status: 'QUERO_JOGAR',
        plataforma: null,
        ...SEM_NOTAS,
        descricao: null,
      },
    ],
    [
      'Jogando com plataforma (o "Criar jogo" da Steam)',
      {
        titulo: 'Jogo Sintetico',
        status: 'JOGANDO',
        plataforma: 'PC',
        ...SEM_NOTAS,
        descricao: null,
      },
    ],
    [
      'Zerado com notas decimais, plataforma antiga e descrição com quebras e HTML',
      {
        titulo: 'A'.repeat(120),
        status: 'ZERADO',
        plataforma: 'Atari 2600',
        gameplay: 9.2,
        historia: 8,
        graficos: 0,
        trilhaSonora: null,
        performance: 10,
        descricao: 'linha 1\nlinha 2 <b>html</b> ção',
      },
    ],
  ];

  it.each(casos)('a API aceita: %s', async (_nome, corpo) => {
    await expect(passa(CreateGameDto, 'body', corpo)).resolves.toBeDefined();
  });

  it('CONTROLE: o pipe recusa campo a mais (o antigo `nota`) e status inventado, senão este teste não provaria nada', async () => {
    await expect(
      passa(CreateGameDto, 'body', { titulo: 'x', status: 'JOGANDO', nota: 9 }),
    ).rejects.toMatchObject({ response: { code: 'VALIDACAO' } });
    await expect(
      passa(CreateGameDto, 'body', { titulo: 'x', status: 'PAUSADO' }),
    ).rejects.toMatchObject({ response: { code: 'VALIDACAO' } });
  });
});

describe('PATCH /games/:id (UpdateGameDto)', () => {
  it('o corpo completo que o formulário de edição envia é aceito', async () => {
    const corpo: UpdateGameRequest = {
      titulo: 'Título Editado',
      status: 'JOGANDO',
      plataforma: 'PC',
      gameplay: 9,
      historia: 8,
      graficos: 8.5,
      trilhaSonora: 9.5,
      performance: 6.5,
      descricao: 'Explorei quase tudo.',
    };
    await expect(passa(UpdateGameDto, 'body', corpo)).resolves.toBeDefined();
  });

  it('remover plataforma, descrição e notas (null) é aceito; título null não', async () => {
    const remover: UpdateGameRequest = { plataforma: null, descricao: null, ...SEM_NOTAS };
    await expect(passa(UpdateGameDto, 'body', remover)).resolves.toBeDefined();
    await expect(passa(UpdateGameDto, 'body', { titulo: null })).rejects.toBeDefined();
  });
});

describe('GET /games e biblioteca (query)', () => {
  it('?status= de cada filtro do catálogo', async () => {
    for (const status of ['ZERADO', 'JOGANDO', 'QUERO_JOGAR'] as const) {
      const query: ListGamesQuery = { status };
      await expect(passa(ListGamesQueryDto, 'query', query)).resolves.toBeDefined();
    }
  });

  it('?busca= da biblioteca da Steam (a única query que o web envia)', async () => {
    await expect(passa(BibliotecaQueryDto, 'query', { busca: 'hollow' })).resolves.toBeDefined();
    await expect(passa(BibliotecaQueryDto, 'query', {})).resolves.toBeDefined();
  });
});

describe('auth, perfil e integrações (corpos)', () => {
  it('login, registro, trocar senha, atualizar nome e excluir conta', async () => {
    const login: LoginRequest = { email: 'usuario@exemplo.com', senha: 'senha-sintetica-1' };
    const registro: RegistroRequest = { nome: 'Pessoa Teste', ...login };
    const trocar: TrocarSenhaRequest = {
      senhaAtual: 'senha-atual-1',
      novaSenha: 'senha-nova-forte-2',
    };
    const perfil: AtualizarPerfilRequest = { nome: 'Nome Novo' };
    const excluir: ExcluirContaRequest = { senha: 'senha-sintetica-1' };

    await expect(passa(LoginDto, 'body', login)).resolves.toBeDefined();
    await expect(passa(RegistroDto, 'body', registro)).resolves.toBeDefined();
    await expect(passa(TrocarSenhaDto, 'body', trocar)).resolves.toBeDefined();
    await expect(passa(AtualizarPerfilDto, 'body', perfil)).resolves.toBeDefined();
    await expect(passa(ExcluirContaDto, 'body', excluir)).resolves.toBeDefined();
  });

  it('ligar um jogo à Steam: { idExterno } e, ao mover o vínculo, { idExterno, mover: true }', async () => {
    const ligar: VincularJogoRequest = { idExterno: '100' };
    const mover: VincularJogoRequest = { idExterno: '100', mover: true };
    await expect(passa(VincularJogoDto, 'body', ligar)).resolves.toBeDefined();
    await expect(passa(VincularJogoDto, 'body', mover)).resolves.toBeDefined();
  });
});
