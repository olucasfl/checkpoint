import { Logger } from '@nestjs/common';
import {
  PlataformaIndisponivelError,
  PlataformaReautenticarError,
} from '../providers/plataforma-errors';
import { CifraDeCredencial } from './cifra-de-credencial';
import { PsnSessao } from './psn-sessao';
import {
  ACCESS_SINTETICO,
  REFRESH_NOVO_SINTETICO,
  REFRESH_SINTETICO,
} from './__fixtures__/respostas';

const CHAVE = '0123456789abcdef'.repeat(4);
const CONTA = '11111111-1111-4111-8111-111111111111';
const cifra = new CifraDeCredencial({ get: () => CHAVE } as never);

function tokens(refresh = REFRESH_SINTETICO, accessEmMs = 3_600_000) {
  return {
    accessToken: ACCESS_SINTETICO,
    accessExpiraEm: new Date(Date.now() + accessEmMs),
    refreshToken: refresh,
    refreshExpiraEm: new Date(Date.now() + 60 * 24 * 3_600_000),
  };
}

function montar(
  opcoes: { expiraEm?: Date; semCredencial?: boolean; refreshGuardado?: string } = {},
) {
  const linha = opcoes.semCredencial
    ? null
    : {
        refreshCifrado: cifra.cifrar(opcoes.refreshGuardado ?? REFRESH_SINTETICO, CONTA),
        expiraEm: opcoes.expiraEm ?? new Date(Date.now() + 30 * 24 * 3_600_000),
      };
  const prisma = {
    credencialPlataforma: {
      findUnique: jest.fn().mockResolvedValue(linha),
      update: jest.fn().mockResolvedValue({ id: 'k1' }),
    },
  };
  const client = { renovar: jest.fn().mockResolvedValue(tokens()) };
  const sessao = new PsnSessao(prisma as never, cifra, client as never);
  return { sessao, prisma, client };
}

const uso = jest.fn((token: string) => Promise.resolve(`ok:${token}`));

beforeEach(() => {
  uso.mockClear();
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('PsnSessao (CA-09, CA-16)', () => {
  it('duas leituras simultâneas esperam UM refresh', async () => {
    const { sessao, client } = montar();

    const [a, b] = await Promise.all([sessao.comToken(CONTA, uso), sessao.comToken(CONTA, uso)]);

    expect(a).toBe(`ok:${ACCESS_SINTETICO}`);
    expect(b).toBe(a);
    expect(client.renovar).toHaveBeenCalledTimes(1);
    expect(client.renovar).toHaveBeenCalledWith(REFRESH_SINTETICO);
  });

  it('com o token válido em memória, zero refresh', async () => {
    const { sessao, client } = montar();

    await sessao.comToken(CONTA, uso);
    await sessao.comToken(CONTA, uso);

    expect(client.renovar).toHaveBeenCalledTimes(1);
  });

  it('token a menos de 1 min de vencer é renovado antes de usar', async () => {
    const { sessao, client } = montar();
    client.renovar.mockResolvedValue(tokens(REFRESH_SINTETICO, 30_000));

    await sessao.comToken(CONTA, uso);
    await sessao.comToken(CONTA, uso);

    expect(client.renovar).toHaveBeenCalledTimes(2);
  });

  it('refresh novo devolvido pela Sony → cifrado e regravado; o mesmo → nada é regravado [~: a Sony pode ou não rotacionar]', async () => {
    const igual = montar();
    await igual.sessao.comToken(CONTA, uso);
    expect(igual.prisma.credencialPlataforma.update).not.toHaveBeenCalled();

    const novo = montar();
    novo.client.renovar.mockResolvedValue(tokens(REFRESH_NOVO_SINTETICO));
    await novo.sessao.comToken(CONTA, uso);

    const gravado = novo.prisma.credencialPlataforma.update.mock.calls[0]?.[0] as {
      data: { refreshCifrado: string };
    };
    expect(gravado.data.refreshCifrado).not.toContain('REFRESH');
    expect(cifra.decifrar(gravado.data.refreshCifrado, CONTA)).toBe(REFRESH_NOVO_SINTETICO);
  });

  it('refresh vencido (`expiraEm` no passado) → reautenticar, SEM chamar a Sony', async () => {
    const { sessao, client } = montar({ expiraEm: new Date(Date.now() - 1000) });

    await expect(sessao.comToken(CONTA, uso)).rejects.toBeInstanceOf(PlataformaReautenticarError);
    expect(client.renovar).not.toHaveBeenCalled();
    expect(uso).not.toHaveBeenCalled();
  });

  it('sem credencial guardada → reautenticar', async () => {
    const { sessao, client } = montar({ semCredencial: true });

    await expect(sessao.comToken(CONTA, uso)).rejects.toBeInstanceOf(PlataformaReautenticarError);
    expect(client.renovar).not.toHaveBeenCalled();
  });

  it('a Sony recusa o refresh → reautenticar', async () => {
    const { sessao, client } = montar();
    client.renovar.mockRejectedValue(new PlataformaReautenticarError());

    await expect(sessao.comToken(CONTA, uso)).rejects.toBeInstanceOf(PlataformaReautenticarError);
  });

  it('chave trocada (a tag não confere) → reautenticar, e o log de erro não tem dado do usuário', async () => {
    const erro = jest.spyOn(Logger.prototype, 'error');
    const outra = new CifraDeCredencial({ get: () => 'fedcba9876543210'.repeat(4) } as never);
    const { sessao, client, prisma } = montar();
    prisma.credencialPlataforma.findUnique.mockResolvedValue({
      refreshCifrado: outra.cifrar(REFRESH_SINTETICO, CONTA),
      expiraEm: new Date(Date.now() + 1e9),
    });

    await expect(sessao.comToken(CONTA, uso)).rejects.toBeInstanceOf(PlataformaReautenticarError);
    expect(client.renovar).not.toHaveBeenCalled();
    expect(String(erro.mock.calls[0]?.[0])).not.toContain(CONTA);
    expect(String(erro.mock.calls[0]?.[0])).not.toContain('REFRESH');
  });

  it('timeout/5xx/429 no refresh NÃO viram reautenticar: sobem como estão', async () => {
    const { sessao, client } = montar();
    client.renovar.mockRejectedValue(new PlataformaIndisponivelError());

    await expect(sessao.comToken(CONTA, uso)).rejects.toBeInstanceOf(PlataformaIndisponivelError);
  });

  it('a Sony recusa o access token no meio do uso: renova UMA vez e tenta de novo; a 2ª recusa sobe', async () => {
    const { sessao, client } = montar();
    const recusa = jest
      .fn()
      .mockRejectedValueOnce(new PlataformaReautenticarError())
      .mockResolvedValueOnce('depois');

    await expect(sessao.comToken(CONTA, recusa)).resolves.toBe('depois');
    expect(client.renovar).toHaveBeenCalledTimes(2);

    const sempre = jest.fn().mockRejectedValue(new PlataformaReautenticarError());
    await expect(sessao.comToken(CONTA, sempre)).rejects.toBeInstanceOf(
      PlataformaReautenticarError,
    );
    expect(sempre).toHaveBeenCalledTimes(2);
  });
});
