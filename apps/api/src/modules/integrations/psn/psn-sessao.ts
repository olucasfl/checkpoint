import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { CACHE_MAX_ENTRIES, PSN_TOKEN_FOLGA_MS } from '../integrations.constants';
import { PlataformaReautenticarError } from '../providers/plataforma-errors';
import { CifraDeCredencial, CifraInvalidaError } from './cifra-de-credencial';
import { PsnClient } from './psn.client';

interface TokenEmMemoria {
  accessToken: string;
  expiraEm: number;
}

/**
 * O access token da PlayStation de cada conta do checkpoint (spec integracao-playstation, "Uso da credencial"). Vive
 * SÓ em memória, por conta (`contaId`: cada usuário tem o próprio refresh, mesmo que dois vinculem a mesma PSN), até
 * pouco antes de vencer. Sem token válido, lê a credencial, decifra e renova; se a Sony devolver um refresh novo, ele
 * é cifrado e regravado. Duas leituras simultâneas esperam UM refresh. Refresh vencido ou recusado (ou cifra que não
 * decifra) vira `PlataformaReautenticarError`, sem chamar a Sony quando o vencimento já é conhecido.
 *
 * Nada aqui loga token, refresh, chave nem texto cifrado.
 */
@Injectable()
export class PsnSessao {
  private readonly logger = new Logger(PsnSessao.name);
  private readonly tokens = new Map<string, TokenEmMemoria>();
  private readonly emVoo = new Map<string, Promise<string>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cifra: CifraDeCredencial,
    private readonly client: PsnClient,
  ) {}

  /**
   * Roda `uso` com um access token válido. Se a Sony o recusar (o token foi revogado antes de vencer), renova UMA
   * vez e tenta de novo; a segunda recusa sobe como `PlataformaReautenticarError`.
   */
  async comToken<T>(contaId: string, uso: (accessToken: string) => Promise<T>): Promise<T> {
    const token = await this.accessToken(contaId, false);
    try {
      return await uso(token);
    } catch (erro) {
      if (!(erro instanceof PlataformaReautenticarError)) {
        throw erro;
      }
      this.tokens.delete(contaId);
      return uso(await this.accessToken(contaId, true));
    }
  }

  /** Esquece o token de uma conta (desvincular). */
  esquecer(contaId: string): void {
    this.tokens.delete(contaId);
  }

  private accessToken(contaId: string, forcar: boolean): Promise<string> {
    if (!forcar) {
      const guardado = this.tokens.get(contaId);
      if (guardado && guardado.expiraEm - PSN_TOKEN_FOLGA_MS > Date.now()) {
        return Promise.resolve(guardado.accessToken);
      }
    }
    const emAndamento = this.emVoo.get(contaId);
    if (emAndamento) {
      return emAndamento;
    }
    const promessa = this.renovar(contaId).finally(() => {
      if (this.emVoo.get(contaId) === promessa) {
        this.emVoo.delete(contaId);
      }
    });
    this.emVoo.set(contaId, promessa);
    return promessa;
  }

  private async renovar(contaId: string): Promise<string> {
    const credencial = await this.prisma.credencialPlataforma.findUnique({
      where: { contaId },
      select: { refreshCifrado: true, expiraEm: true },
    });
    // Sem credencial ou com o vencimento já passado: a Sony nem é consultada.
    if (!credencial || credencial.expiraEm.getTime() <= Date.now()) {
      throw new PlataformaReautenticarError();
    }
    let refresh: string;
    try {
      refresh = this.cifra.decifrar(credencial.refreshCifrado, contaId);
    } catch (erro) {
      if (erro instanceof CifraInvalidaError) {
        // Chave trocada ou texto adulterado: só o fato, nenhum dado.
        this.logger.error('A credencial da PlayStation não pôde ser decifrada (chave trocada?)');
        throw new PlataformaReautenticarError();
      }
      throw erro;
    }

    const tokens = await this.client.renovar(refresh);
    if (tokens.refreshToken !== refresh) {
      await this.prisma.credencialPlataforma.update({
        where: { contaId },
        data: {
          refreshCifrado: this.cifra.cifrar(tokens.refreshToken, contaId),
          expiraEm: tokens.refreshExpiraEm,
        },
        select: { id: true },
      });
    }
    if (this.tokens.size >= CACHE_MAX_ENTRIES) {
      const maisAntigo = this.tokens.keys().next();
      if (!maisAntigo.done) {
        this.tokens.delete(maisAntigo.value);
      }
    }
    this.tokens.set(contaId, {
      accessToken: tokens.accessToken,
      expiraEm: tokens.accessExpiraEm.getTime(),
    });
    return tokens.accessToken;
  }
}
