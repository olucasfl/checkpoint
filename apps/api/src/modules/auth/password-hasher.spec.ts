import { PASSWORD_MAX_BYTES } from '@checkpoint/shared';
import { ScryptPasswordHasher } from './password-hasher';

// Hash de verdade (scrypt N=2^17): cada um custa ~0,3 s e 128 MiB, então poucos casos.
jest.setTimeout(30_000);

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher();

  it('grava no formato autodescritivo scrypt$N$r$p$sal$hash (base64)', async () => {
    const hash = await hasher.hash('segredo-forte');

    const [format, n, r, p, salt, key] = hash.split('$');
    expect([format, n, r, p]).toEqual(['scrypt', String(2 ** 17), '8', '1']);
    expect(Buffer.from(salt ?? '', 'base64')).toHaveLength(16);
    expect(Buffer.from(key ?? '', 'base64')).toHaveLength(64);
    expect(hash).not.toContain('segredo-forte');
  });

  it('confere a senha certa e recusa a errada', async () => {
    const hash = await hasher.hash('segredo-forte');

    await expect(hasher.verify(hash, 'segredo-forte')).resolves.toBe(true);
    await expect(hasher.verify(hash, 'segredo-fortE')).resolves.toBe(false);
  });

  it('o sal é aleatório: a mesma senha gera hashes diferentes', async () => {
    const [a, b] = await Promise.all([hasher.hash('mesma-senha'), hasher.hash('mesma-senha')]);

    expect(a).not.toBe(b);
  });

  it('aceita uma senha no teto de 72 bytes (36 "á")', async () => {
    const senha = 'á'.repeat(PASSWORD_MAX_BYTES / 2);
    const hash = await hasher.hash(senha);

    await expect(hasher.verify(hash, senha)).resolves.toBe(true);
  });

  it.each(['', 'lixo', 'scrypt$1$2$3', 'argon2$x$y$z$a$b'])(
    'um hash malformado (%j) não confere e não lança',
    async (hash) => {
      await expect(hasher.verify(hash, 'qualquer')).resolves.toBe(false);
    },
  );
});
