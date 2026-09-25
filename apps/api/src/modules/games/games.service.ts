import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type Game as GameRow } from '@prisma/client';
import {
  GAME_RATING_KEYS,
  notaMedia,
  statusAllowsRating,
  type CreateGameRequest,
  type Game,
  type GameStatus,
  type UpdateGameRequest,
} from '@checkpoint/shared';
import { badRequestError, conflictError, type ApiFieldErrors } from '../../common/errors/api-error';
import {
  DADOS_JOGO_PLATAFORMA_SELECT,
  toDadosJogoPlataforma,
  type DadosJogoPlataformaRow,
} from '../integrations/lib/dados-plataforma';
import { PrismaService } from '../../database/prisma.service';
import { COVER_INVALID_TYPE, COVER_MISSING } from './cover/cover-messages';
import { detectImageType } from './cover/image-signature';
import { StorageService } from './cover/storage.service';
import { columnsOfTenths, ratingsOfRow, tenthsOfRow, toTenths, type Tenths } from './lib/ratings';

const GAME_NOT_FOUND = 'Jogo não encontrado';

/**
 * A camada de cada plataforma vinculada, lida junto do jogo (uma consulta a mais, sem chamar a plataforma).
 * `dadosPlataforma` é opcional na linha: quem não faz o `include` (o `create`) devolve `[]`.
 */
export const DADOS_PLATAFORMA_INCLUDE = {
  dadosPlataforma: { select: DADOS_JOGO_PLATAFORMA_SELECT, orderBy: { provedor: 'asc' } },
} as const;

type GameComPlataforma = GameRow & { dadosPlataforma?: DadosJogoPlataformaRow[] };
const DUPLICATE_GAME = 'Já existe esse jogo nesta plataforma';
const RATINGS_NOT_ALLOWED = 'Notas só podem ser preenchidas quando o status é Zerado ou Jogando';
const ZERADO_NEEDS_RATING = 'Preencha ao menos um critério para marcar como Zerado';
const EMPTY_UPDATE = 'Informe ao menos um campo para atualizar';

/** Gravados aparados; plataforma ausente, null ou só espaços vira "". */
function cleanTitle(titulo: string): string {
  return titulo.trim();
}

/** A descrição chega aparada pelo DTO; vazia, só espaços ou null viram `null` (sem descrição). */
function cleanDescription(descricao: string | null | undefined): string | null {
  const texto = (descricao ?? '').trim();
  return texto === '' ? null : texto;
}

function cleanPlatform(plataforma: string | null | undefined): string {
  return (plataforma ?? '').trim();
}

/**
 * Chaves de comparação da unicidade: caixa ignorada. Acentos e espaços internos NÃO são
 * normalizados ("Zelda" e "Zélda" são jogos diferentes).
 */
function uniquenessKeys(titulo: string, plataforma: string) {
  return {
    tituloNormalizado: titulo.toLowerCase(),
    plataformaNormalizada: plataforma.toLowerCase(),
  };
}

function isKnownRequestError(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}

@Injectable()
export class GamesService {
  private readonly logger = new Logger(GamesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // Todo acesso é do dono: `userId` entra em todo `where`. Jogo de outro usuário é tratado como
  // inexistente, sem revelar que o id existe.
  async list(userId: string, status?: GameStatus): Promise<Game[]> {
    const rows = await this.prisma.game.findMany({
      where: { userId, ...(status && { status }) },
      orderBy: [{ atualizadoEm: 'desc' }, { criadoEm: 'desc' }],
      include: DADOS_PLATAFORMA_INCLUDE,
    });

    return rows.map((row) => this.toGame(row));
  }

  async create(userId: string, dto: CreateGameRequest): Promise<Game> {
    const titulo = cleanTitle(dto.titulo);
    const plataforma = cleanPlatform(dto.plataforma);
    const notas = {} as Tenths;
    for (const key of GAME_RATING_KEYS) {
      notas[key] = toTenths(dto[key]);
    }

    // Criar sempre "mexe" nas notas: um Zerado novo precisa de ao menos um critério.
    this.assertRatingsAllowed(dto.status, notas, true);
    await this.assertNotDuplicate(userId, titulo, plataforma);

    try {
      const row = await this.prisma.game.create({
        data: {
          userId,
          titulo,
          plataforma,
          status: dto.status,
          ...columnsOfTenths(notas),
          descricao: cleanDescription(dto.descricao),
          ...uniquenessKeys(titulo, plataforma),
        },
      });
      return this.toGame(row);
    } catch (error) {
      throw this.translateDatabaseError(error);
    }
  }

  async update(userId: string, id: string, dto: UpdateGameRequest): Promise<Game> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw badRequestError(EMPTY_UPDATE);
    }

    const current = await this.findOrFail(userId, id);

    // A validação olha o estado FINAL (registro atual + body), não só o body: um PATCH só com
    // { status: "QUERO_JOGAR" } num jogo que já tem nota tem de falhar.
    const titulo = dto.titulo !== undefined ? cleanTitle(dto.titulo) : current.titulo;
    const plataforma =
      dto.plataforma !== undefined ? cleanPlatform(dto.plataforma) : current.plataforma;
    const status = dto.status ?? current.status;
    const gravadas = tenthsOfRow(current);
    const notas: Tenths = { ...gravadas };
    for (const key of GAME_RATING_KEYS) {
      if (dto[key] !== undefined) {
        notas[key] = toTenths(dto[key]);
      }
    }
    const descricao =
      dto.descricao !== undefined ? cleanDescription(dto.descricao) : current.descricao;

    // "Zerado exige ao menos 1 critério" vale quando a escrita MUDA o status para Zerado ou o VALOR de
    // algum critério em relação ao gravado. Presença no body não conta: o formulário envia tudo a cada
    // salvamento, e assim os jogos Zerado sem notas (as antigas foram descartadas) continuam editáveis.
    const virouZerado = status === 'ZERADO' && current.status !== 'ZERADO';
    const notaMudou = GAME_RATING_KEYS.some((key) => notas[key] !== gravadas[key]);

    this.assertRatingsAllowed(status, notas, virouZerado || notaMudou);
    await this.assertNotDuplicate(userId, titulo, plataforma, id);

    try {
      const row = await this.prisma.game.update({
        where: { id, userId },
        data: {
          titulo,
          plataforma,
          status,
          ...columnsOfTenths(notas),
          descricao,
          ...uniquenessKeys(titulo, plataforma),
        },
        include: DADOS_PLATAFORMA_INCLUDE,
      });
      return this.toGame(row);
    } catch (error) {
      throw this.translateDatabaseError(error);
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    let removed: GameRow;

    try {
      removed = await this.prisma.game.delete({ where: { id, userId } });
    } catch (error) {
      throw this.translateDatabaseError(error);
    }

    // O jogo já foi removido: uma falha ao apagar a capa não pode desfazer isso (best effort).
    if (removed.capaPath) {
      await this.removeObjectQuietly(removed.capaPath);
    }
  }

  /**
   * Troca a capa: sobe o objeto novo, aponta o jogo para ele e só então apaga o antigo. Se o
   * banco falhar depois do upload, o objeto novo é apagado para não ficar órfão.
   * Capas novas ficam sob o prefixo do dono (`<userId>/<gameId>/…`), o que facilita apagar tudo de
   * uma conta. As anteriores seguem no caminho gravado no `capaPath`, sem migrar objeto.
   */
  async setCover(userId: string, id: string, file: { buffer: Buffer } | undefined): Promise<Game> {
    if (!file || file.buffer.length === 0) {
      throw badRequestError(COVER_MISSING, { arquivo: COVER_MISSING });
    }

    const current = await this.findOrFail(userId, id);

    const image = detectImageType(file.buffer);
    if (!image) {
      throw badRequestError(COVER_INVALID_TYPE, { arquivo: COVER_INVALID_TYPE });
    }

    const capaPath = `${userId}/${id}/${randomUUID()}.${image.extension}`;
    await this.storage.upload(capaPath, file.buffer, image.mime);

    let updated: GameRow;
    try {
      updated = await this.prisma.game.update({
        where: { id, userId },
        data: { capaPath },
        include: DADOS_PLATAFORMA_INCLUDE,
      });
    } catch (error) {
      await this.removeObjectQuietly(capaPath);
      throw this.translateDatabaseError(error);
    }

    if (current.capaPath) {
      await this.removeObjectQuietly(current.capaPath);
    }

    return this.toGame(updated);
  }

  /**
   * Remove a capa: apaga o objeto ANTES de zerar o banco, para uma falha do storage (502) não
   * deixar o jogo apontando para nada. Sem capa, devolve o jogo sem chamar o storage (idempotente).
   */
  async removeCover(userId: string, id: string): Promise<Game> {
    const current = await this.findOrFail(userId, id);

    if (!current.capaPath) {
      return this.toGame(current);
    }

    await this.storage.remove(current.capaPath);

    try {
      const updated = await this.prisma.game.update({
        where: { id, userId },
        data: { capaPath: null },
        include: DADOS_PLATAFORMA_INCLUDE,
      });
      return this.toGame(updated);
    } catch (error) {
      throw this.translateDatabaseError(error);
    }
  }

  /**
   * Os caminhos das capas de todos os jogos do usuário, lidos ANTES de excluir a conta: depois do
   * cascade, os jogos (e os caminhos) não existem mais. Caminhos, e não "a pasta <userId>/": a REST do
   * Storage remove por nome exato, e as capas anteriores ao dono dos jogos ficam em `<gameId>/…`.
   */
  async listarCapasDoUsuario(userId: string): Promise<string[]> {
    const rows = await this.prisma.game.findMany({
      where: { userId, capaPath: { not: null } },
      select: { capaPath: true },
    });
    return rows.flatMap((row) => (row.capaPath ? [row.capaPath] : []));
  }

  /**
   * Remove cada capa em best effort, uma a uma: a falha de um objeto (que fica órfão, com um aviso
   * no log) não impede os demais nem o chamador.
   */
  async removerCapasSemFalhar(caminhos: readonly string[]): Promise<void> {
    for (const caminho of caminhos) {
      await this.removeObjectQuietly(caminho);
    }
  }

  /**
   * Sem plataforma = "" no banco (ver schema.prisma); a API expõe null. `capaPath` e `userId` nunca
   * saem: os campos da resposta são listados um a um.
   */
  private toGame(row: GameComPlataforma): Game {
    const notas = ratingsOfRow(row);
    return {
      id: row.id,
      titulo: row.titulo,
      plataforma: row.plataforma === '' ? null : row.plataforma,
      status: row.status,
      notas,
      notaMedia: notaMedia(notas),
      descricao: row.descricao,
      capaUrl: row.capaPath ? this.storage.publicUrl(row.capaPath) : null,
      criadoEm: row.criadoEm.toISOString(),
      atualizadoEm: row.atualizadoEm.toISOString(),
      dadosPlataforma: (row.dadosPlataforma ?? []).map(toDadosJogoPlataforma),
    };
  }

  private async findOrFail(userId: string, id: string): Promise<GameComPlataforma> {
    const game = await this.prisma.game.findUnique({
      where: { id, userId },
      include: DADOS_PLATAFORMA_INCLUDE,
    });
    if (!game) {
      throw new NotFoundException(GAME_NOT_FOUND);
    }
    return game;
  }

  /** Best effort: a falha já foi registrada pelo StorageService (status e mensagem, sem segredos). */
  private async removeObjectQuietly(path: string): Promise<void> {
    try {
      await this.storage.remove(path);
    } catch {
      this.logger.warn(`Objeto de capa não removido do storage (pode ter ficado órfão): ${path}`);
    }
  }

  /**
   * As regras das notas sobre o estado final. Quero jogar não tem nenhuma (sempre valida); Zerado exige ao
   * menos um critério só quando `exigeZerado` (a escrita mexeu no status ou numa nota). A faixa e o passo
   * de cada critério já foram validados no DTO.
   */
  private assertRatingsAllowed(status: GameStatus, notas: Tenths, exigeZerado: boolean): void {
    const preenchidos = GAME_RATING_KEYS.filter((key) => notas[key] !== null);

    if (preenchidos.length > 0 && !statusAllowsRating(status)) {
      const fields: ApiFieldErrors = {};
      for (const key of preenchidos) {
        fields[key] = RATINGS_NOT_ALLOWED;
      }
      throw badRequestError(RATINGS_NOT_ALLOWED, fields);
    }

    if (status === 'ZERADO' && exigeZerado && preenchidos.length === 0) {
      throw badRequestError(ZERADO_NEEDS_RATING, { notas: ZERADO_NEEDS_RATING });
    }
  }

  /**
   * Checagem prévia para dar um erro claro. Quem garante a unicidade de verdade é o @@unique do
   * banco: se duas requests passarem juntas por aqui, a segunda cai em P2002 (translateDatabaseError).
   * Ao editar, o próprio jogo (`ignoreId`) não conta como duplicata. A unicidade é por dono: o mesmo
   * jogo em contas diferentes não conflita.
   */
  private async assertNotDuplicate(
    userId: string,
    titulo: string,
    plataforma: string,
    ignoreId?: string,
  ): Promise<void> {
    const duplicate = await this.prisma.game.findFirst({
      where: {
        userId,
        ...uniquenessKeys(titulo, plataforma),
        ...(ignoreId && { id: { not: ignoreId } }),
      },
      select: { id: true },
    });

    if (duplicate) {
      throw conflictError(DUPLICATE_GAME, { titulo: DUPLICATE_GAME });
    }
  }

  private translateDatabaseError(error: unknown): unknown {
    if (isKnownRequestError(error, 'P2002')) {
      return conflictError(DUPLICATE_GAME, { titulo: DUPLICATE_GAME });
    }
    if (isKnownRequestError(error, 'P2025')) {
      return new NotFoundException(GAME_NOT_FOUND);
    }
    return error;
  }
}
