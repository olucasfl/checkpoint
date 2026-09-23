import { randomUUID } from 'node:crypto';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, type Game as GameRow } from '@prisma/client';
import {
  statusAllowsRating,
  type CreateGameRequest,
  type Game,
  type GameStatus,
  type UpdateGameRequest,
} from '@checkpoint/shared';
import { badRequestError, conflictError } from '../../common/errors/api-error';
import { PrismaService } from '../../database/prisma.service';
import { COVER_INVALID_TYPE, COVER_MISSING } from './cover/cover-messages';
import { detectImageType } from './cover/image-signature';
import { StorageService } from './cover/storage.service';

const GAME_NOT_FOUND = 'Jogo não encontrado';
const DUPLICATE_GAME = 'Já existe esse jogo nesta plataforma';
const RATING_NOT_ALLOWED = 'Nota só pode ser preenchida quando o status é Zerado ou Jogando';
const EMPTY_UPDATE = 'Informe ao menos um campo para atualizar';

/** Gravados aparados; plataforma ausente, null ou só espaços vira "". */
function cleanTitle(titulo: string): string {
  return titulo.trim();
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

  async list(status?: GameStatus): Promise<Game[]> {
    const rows = await this.prisma.game.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ atualizadoEm: 'desc' }, { criadoEm: 'desc' }],
    });

    return rows.map((row) => this.toGame(row));
  }

  async create(dto: CreateGameRequest): Promise<Game> {
    const titulo = cleanTitle(dto.titulo);
    const plataforma = cleanPlatform(dto.plataforma);
    const nota = dto.nota ?? null;

    this.assertRatingAllowed(dto.status, nota);
    await this.assertNotDuplicate(titulo, plataforma);

    try {
      const row = await this.prisma.game.create({
        data: {
          titulo,
          plataforma,
          status: dto.status,
          nota,
          ...uniquenessKeys(titulo, plataforma),
        },
      });
      return this.toGame(row);
    } catch (error) {
      throw this.translateDatabaseError(error);
    }
  }

  async update(id: string, dto: UpdateGameRequest): Promise<Game> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw badRequestError(EMPTY_UPDATE);
    }

    const current = await this.findOrFail(id);

    // A validação olha o estado FINAL (registro atual + body), não só o body: um PATCH só com
    // { status: "QUERO_JOGAR" } num jogo que já tem nota tem de falhar.
    const titulo = dto.titulo !== undefined ? cleanTitle(dto.titulo) : current.titulo;
    const plataforma =
      dto.plataforma !== undefined ? cleanPlatform(dto.plataforma) : current.plataforma;
    const status = dto.status ?? current.status;
    const nota = dto.nota !== undefined ? dto.nota : current.nota;

    this.assertRatingAllowed(status, nota);
    await this.assertNotDuplicate(titulo, plataforma, id);

    try {
      const row = await this.prisma.game.update({
        where: { id },
        data: { titulo, plataforma, status, nota, ...uniquenessKeys(titulo, plataforma) },
      });
      return this.toGame(row);
    } catch (error) {
      throw this.translateDatabaseError(error);
    }
  }

  async remove(id: string): Promise<void> {
    let removed: GameRow;

    try {
      removed = await this.prisma.game.delete({ where: { id } });
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
   */
  async setCover(id: string, file: { buffer: Buffer } | undefined): Promise<Game> {
    if (!file || file.buffer.length === 0) {
      throw badRequestError(COVER_MISSING, { arquivo: COVER_MISSING });
    }

    const current = await this.findOrFail(id);

    const image = detectImageType(file.buffer);
    if (!image) {
      throw badRequestError(COVER_INVALID_TYPE, { arquivo: COVER_INVALID_TYPE });
    }

    const capaPath = `${id}/${randomUUID()}.${image.extension}`;
    await this.storage.upload(capaPath, file.buffer, image.mime);

    let updated: GameRow;
    try {
      updated = await this.prisma.game.update({ where: { id }, data: { capaPath } });
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
  async removeCover(id: string): Promise<Game> {
    const current = await this.findOrFail(id);

    if (!current.capaPath) {
      return this.toGame(current);
    }

    await this.storage.remove(current.capaPath);

    try {
      const updated = await this.prisma.game.update({ where: { id }, data: { capaPath: null } });
      return this.toGame(updated);
    } catch (error) {
      throw this.translateDatabaseError(error);
    }
  }

  /** Sem plataforma = "" no banco (ver schema.prisma); a API expõe null. `capaPath` nunca sai. */
  private toGame(row: GameRow): Game {
    return {
      id: row.id,
      titulo: row.titulo,
      plataforma: row.plataforma === '' ? null : row.plataforma,
      status: row.status,
      nota: row.nota,
      capaUrl: row.capaPath ? this.storage.publicUrl(row.capaPath) : null,
      criadoEm: row.criadoEm.toISOString(),
      atualizadoEm: row.atualizadoEm.toISOString(),
    };
  }

  private async findOrFail(id: string): Promise<GameRow> {
    const game = await this.prisma.game.findUnique({ where: { id } });
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

  private assertRatingAllowed(status: GameStatus, nota: number | null): void {
    if (nota !== null && !statusAllowsRating(status)) {
      throw badRequestError(RATING_NOT_ALLOWED, { nota: RATING_NOT_ALLOWED });
    }
  }

  /**
   * Checagem prévia para dar um erro claro. Quem garante a unicidade de verdade é o @@unique do
   * banco: se duas requests passarem juntas por aqui, a segunda cai em P2002 (translateDatabaseError).
   * Ao editar, o próprio jogo (`ignoreId`) não conta como duplicata.
   */
  private async assertNotDuplicate(
    titulo: string,
    plataforma: string,
    ignoreId?: string,
  ): Promise<void> {
    const duplicate = await this.prisma.game.findFirst({
      where: { ...uniquenessKeys(titulo, plataforma), ...(ignoreId && { id: { not: ignoreId } }) },
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
