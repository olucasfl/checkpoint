import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type EnvironmentVariables } from '../../../config/env.validation';

const VERSAO = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** A decifragem falhou: chave errada/trocada, texto adulterado ou conta (AAD) diferente. Sem detalhe de propósito. */
export class CifraInvalidaError extends Error {
  constructor() {
    super('não foi possível decifrar a credencial');
    this.name = 'CifraInvalidaError';
  }
}

/**
 * Cifra o refresh token da PlayStation em repouso (spec integracao-playstation, D1): AES-256-GCM, IV aleatório de
 * 12 bytes por gravação, _tag_ de 16 bytes e a conta como AAD (um texto copiado para outra conta não decifra).
 * Formato `v1:<iv>:<tag>:<texto>`, em base64url. Sem chave configurada, `disponivel` é `false` e a PlayStation
 * fica desligada; nada aqui loga o texto claro, o cifrado nem a chave.
 */
@Injectable()
export class CifraDeCredencial {
  private readonly chave: Buffer | null;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    const hex = config.get('PSN_TOKEN_ENCRYPTION_KEY', { infer: true });
    this.chave = typeof hex === 'string' && hex !== '' ? Buffer.from(hex, 'hex') : null;
  }

  get disponivel(): boolean {
    return this.chave !== null;
  }

  cifrar(claro: string, contaId: string): string {
    const chave = this.exigirChave();
    const iv = randomBytes(IV_BYTES);
    const cifra = createCipheriv('aes-256-gcm', chave, iv, { authTagLength: TAG_BYTES });
    cifra.setAAD(Buffer.from(contaId, 'utf8'));
    const texto = Buffer.concat([cifra.update(claro, 'utf8'), cifra.final()]);
    const tag = cifra.getAuthTag();
    return [VERSAO, iv, tag, texto]
      .map((parte) => (typeof parte === 'string' ? parte : parte.toString('base64url')))
      .join(':');
  }

  decifrar(cifrado: string, contaId: string): string {
    const chave = this.exigirChave();
    const partes = cifrado.split(':');
    if (partes.length !== 4 || partes[0] !== VERSAO) {
      throw new CifraInvalidaError();
    }
    try {
      const iv = Buffer.from(partes[1] ?? '', 'base64url');
      const tag = Buffer.from(partes[2] ?? '', 'base64url');
      const texto = Buffer.from(partes[3] ?? '', 'base64url');
      if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
        throw new CifraInvalidaError();
      }
      const decifra = createDecipheriv('aes-256-gcm', chave, iv, { authTagLength: TAG_BYTES });
      decifra.setAAD(Buffer.from(contaId, 'utf8'));
      decifra.setAuthTag(tag);
      return Buffer.concat([decifra.update(texto), decifra.final()]).toString('utf8');
    } catch {
      throw new CifraInvalidaError();
    }
  }

  private exigirChave(): Buffer {
    if (!this.chave) {
      throw new Error('PSN_TOKEN_ENCRYPTION_KEY não configurada');
    }
    return this.chave;
  }
}
