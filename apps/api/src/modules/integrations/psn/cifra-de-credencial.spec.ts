import { CifraDeCredencial, CifraInvalidaError } from './cifra-de-credencial';
import { REFRESH_SINTETICO } from './__fixtures__/respostas';

const CHAVE = '0123456789abcdef'.repeat(4);
const OUTRA_CHAVE = 'fedcba9876543210'.repeat(4);
const CONTA = '11111111-1111-4111-8111-111111111111';
const OUTRA_CONTA = '22222222-2222-4222-8222-222222222222';

function cifraCom(chave?: string): CifraDeCredencial {
  return new CifraDeCredencial({ get: () => chave } as never);
}

describe('CifraDeCredencial (CA-05)', () => {
  const cifra = cifraCom(CHAVE);

  it('ida e volta devolve o mesmo texto', () => {
    expect(cifra.decifrar(cifra.cifrar(REFRESH_SINTETICO, CONTA), CONTA)).toBe(REFRESH_SINTETICO);
  });

  it('dois cifrados do mesmo texto diferem (IV novo a cada gravação)', () => {
    expect(cifra.cifrar(REFRESH_SINTETICO, CONTA)).not.toBe(cifra.cifrar(REFRESH_SINTETICO, CONTA));
  });

  it('o formato é v1:<iv>:<tag>:<texto> e o texto cifrado não contém o token', () => {
    const cifrado = cifra.cifrar(REFRESH_SINTETICO, CONTA);

    expect(cifrado.split(':')).toHaveLength(4);
    expect(cifrado.startsWith('v1:')).toBe(true);
    expect(cifrado).not.toContain(REFRESH_SINTETICO);
    expect(cifrado).not.toContain('REFRESH_SINTETICO');
  });

  it.each([
    ['o IV', 1],
    ['a tag', 2],
    ['o texto', 3],
  ])('trocar um byte de %s faz a decifragem falhar', (_nome, indice) => {
    const partes = cifra.cifrar(REFRESH_SINTETICO, CONTA).split(':');
    const buffer = Buffer.from(partes[indice] ?? '', 'base64url');
    buffer[0] = (buffer[0] ?? 0) ^ 0xff;
    partes[indice] = buffer.toString('base64url');

    expect(() => cifra.decifrar(partes.join(':'), CONTA)).toThrow(CifraInvalidaError);
  });

  it('outra conta (AAD) não decifra o texto', () => {
    const cifrado = cifra.cifrar(REFRESH_SINTETICO, CONTA);

    expect(() => cifra.decifrar(cifrado, OUTRA_CONTA)).toThrow(CifraInvalidaError);
  });

  it('outra chave não decifra o texto', () => {
    const cifrado = cifra.cifrar(REFRESH_SINTETICO, CONTA);

    expect(() => cifraCom(OUTRA_CHAVE).decifrar(cifrado, CONTA)).toThrow(CifraInvalidaError);
  });

  it.each(['', 'v1:a:b', 'v2:a:b:c', 'lixo', 'v1:::'])(
    'texto malformado %j falha sem detalhe',
    (texto) => {
      expect(() => cifra.decifrar(texto, CONTA)).toThrow(CifraInvalidaError);
    },
  );

  it('sem chave, `disponivel` é false e cifrar/decifrar lançam', () => {
    for (const ausente of [undefined, '']) {
      const semChave = cifraCom(ausente);

      expect(semChave.disponivel).toBe(false);
      expect(() => semChave.cifrar('x', CONTA)).toThrow();
    }
    expect(cifra.disponivel).toBe(true);
  });
});
