import { Injectable, NotFoundException } from '@nestjs/common';
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

const GAME_NOT_FOUND = 'Jogo não encontrado';
const DUPLICATE_GAME = 'Já existe esse jogo nesta plataforma';
const RATING_NOT_ALLOWED = 'Nota só pode ser preenchida quando o status é Zerado ou Jogando';
const EMPTY_UPDATE = 'Informe ao menos um campo para atualizar';

/** Sem plataforma = "" no banco (ver schema.prisma); a API expõe null. */
function toGame(row: GameRow): Game {
  return {
    id: row.id,
    titulo: row.titulo,
    plataforma: row.plataforma === '' ? null : row.plataforma,
    status: row.status,
    nota: row.nota,
    criadoEm: row.criadoEm.toISOString(),
    atualizadoEm: row.atualizadoEm.toISOString(),
  };
}

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
  constructor(private readonly prisma: PrismaService) {}

  async list(status?: GameStatus): Promise<Game[]> {
    const rows = await this.prisma.game.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ atualizadoEm: 'desc' }, { criadoEm: 'desc' }],
    });

    return rows.map(toGame);
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
      return toGame(row);
    } catch (error) {
      throw this.translateDatabaseError(error);
    }
  }

  async update(id: string, dto: UpdateGameRequest): Promise<Game> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw badRequestError(EMPTY_UPDATE);
    }

    const current = await this.prisma.game.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException(GAME_NOT_FOUND);
    }

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
      return toGame(row);
    } catch (error) {
      throw this.translateDatabaseError(error);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.game.delete({ where: { id } });
    } catch (error) {
      throw this.translateDatabaseError(error);
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
