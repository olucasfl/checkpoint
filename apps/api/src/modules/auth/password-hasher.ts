import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/** Isola o algoritmo: trocar de scrypt para argon2 não afeta o resto do módulo. */
export abstract class PasswordHasher {
  /** Devolve o hash no formato autodescritivo do algoritmo. */
  abstract hash(senha: string): Promise<string>;
  abstract verify(hash: string, senha: string): Promise<boolean>;
}

function deriveKey(
  senha: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(senha, salt, keyLength, options, (error, derived) =>
      error ? reject(error) : resolve(derived),
    );
  });
}

// Parâmetros do plano B da spec (o `argon2` não instala nesta máquina: sem binário pré-compilado e
// sem toolchain). N = 2^17 pede 128 * N * r = 128 MiB de memória, acima do padrão do Node (32 MiB).
const N = 2 ** 17;
const R = 8;
const P = 1;
const SALT_BYTES = 16;
const KEY_BYTES = 64;
const MAX_MEMORY_BYTES = 256 * 1024 * 1024;
const FORMAT = 'scrypt';

/**
 * `node:crypto.scrypt`, sem dependência. Gravado como `scrypt$N$r$p$sal$hash` (sal e hash em base64):
 * os parâmetros vão junto, então dá para subir o custo depois sem invalidar as senhas antigas.
 */
@Injectable()
export class ScryptPasswordHasher extends PasswordHasher {
  async hash(senha: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const key = await deriveKey(senha, salt, KEY_BYTES, {
      N,
      r: R,
      p: P,
      maxmem: MAX_MEMORY_BYTES,
    });
    return [FORMAT, N, R, P, salt.toString('base64'), key.toString('base64')].join('$');
  }

  async verify(hash: string, senha: string): Promise<boolean> {
    const [format, n, r, p, saltB64, keyB64] = hash.split('$');
    if (format !== FORMAT || !n || !r || !p || !saltB64 || !keyB64) {
      return false;
    }
    const expected = Buffer.from(keyB64, 'base64');
    const derived = await deriveKey(senha, Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: MAX_MEMORY_BYTES,
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  }
}
