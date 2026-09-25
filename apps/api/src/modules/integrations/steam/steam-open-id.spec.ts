import { Logger } from '@nestjs/common';
import { PlataformaIndisponivelError, PlataformaLimiteError } from '../providers/plataforma-errors';
import {
  OpenIdCanceladoError,
  OpenIdInvalidoError,
  STEAM_OPENID_ENDPOINT,
  SteamOpenId,
} from './steam-open-id';

// Valores sintéticos e óbvios (RULES.md §8): nenhum SteamID, state nem assinatura reais.
const STEAM_ID = '76561190000000000';
const RETURN_TO = 'http://localhost:3333/api/integracoes/steam/retorno?state=STATE.SINTETICO.XYZ';
const REALM = 'http://localhost:3333';

const openId = new SteamOpenId();

/** O retorno que a Steam manda ao navegador, e que o navegador entrega à API. */
function retornoValido(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    state: 'STATE.SINTETICO.XYZ',
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'id_res',
    'openid.op_endpoint': STEAM_OPENID_ENDPOINT,
    'openid.claimed_id': `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    'openid.identity': `https://steamcommunity.com/openid/id/${STEAM_ID}`,
    'openid.return_to': RETURN_TO,
    'openid.response_nonce': '2026-09-25T12:00:00ZNONCESINTETICO',
    'openid.assoc_handle': '1234567890',
    'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle',
    'openid.sig': 'ASSINATURASINTETICA=',
    ...overrides,
  };
}

function textoDaSteam(texto: string, status = 200): Response {
  return new Response(texto, { status, headers: { 'content-type': 'text/plain;charset=utf-8' } });
}

describe('SteamOpenId', () => {
  let fetchMock: jest.SpyInstance;
  let logCalls: string[];

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
    logCalls = [];
    for (const method of ['error', 'warn', 'log', 'debug', 'verbose'] as const) {
      jest.spyOn(Logger.prototype, method).mockImplementation((...args: unknown[]) => {
        logCalls.push(args.map(String).join(' '));
      });
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('montarUrl', () => {
    it('vai ao endpoint da Steam com checkid_setup, return_to e realm (CA-06)', () => {
      const url = new URL(openId.montarUrl({ returnTo: RETURN_TO, realm: REALM }));

      expect(`${url.origin}${url.pathname}`).toBe('https://steamcommunity.com/openid/login');
      expect(Object.fromEntries(url.searchParams)).toEqual({
        'openid.ns': 'http://specs.openid.net/auth/2.0',
        'openid.mode': 'checkid_setup',
        'openid.return_to': RETURN_TO,
        'openid.realm': REALM,
        'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
        'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
      });
    });
  });

  describe('validarRetorno — o caminho feliz', () => {
    it('confirma na Steam e devolve o SteamID do claimed_id (CA-08)', async () => {
      fetchMock.mockResolvedValueOnce(
        textoDaSteam('ns:http://specs.openid.net/auth/2.0\nis_valid:true\n'),
      );

      await expect(openId.validarRetorno(retornoValido(), RETURN_TO)).resolves.toBe(STEAM_ID);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(STEAM_OPENID_ENDPOINT);
      expect(init.method).toBe('POST');
      expect(init.redirect).toBe('manual');
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(init.headers).toMatchObject({ 'content-type': 'application/x-www-form-urlencoded' });
      const enviado = new URLSearchParams(init.body as string);
      expect(enviado.get('openid.mode')).toBe('check_authentication');
      // Todos os openid.* recebidos vão de volta, com a assinatura original; o `state` (não é openid.*) não vai.
      expect(enviado.get('openid.sig')).toBe('ASSINATURASINTETICA=');
      expect(enviado.get('openid.response_nonce')).toBe('2026-09-25T12:00:00ZNONCESINTETICO');
      expect(enviado.has('state')).toBe(false);
    });

    it('ignora parâmetros que não são openid.* (o state e outros)', async () => {
      fetchMock.mockResolvedValueOnce(textoDaSteam('is_valid:true'));

      await expect(
        openId.validarRetorno(retornoValido({ outro: ['a', 'b'] }), RETURN_TO),
      ).resolves.toBe(STEAM_ID);
    });
  });

  describe('validarRetorno — cancelado', () => {
    it('openid.mode=cancel → OpenIdCanceladoError, sem chamar a Steam (CA-12)', async () => {
      await expect(
        openId.validarRetorno({ state: 'x', 'openid.mode': 'cancel' }, RETURN_TO),
      ).rejects.toBeInstanceOf(OpenIdCanceladoError);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('validarRetorno — as checagens locais recusam sem gastar chamada de rede (CA-11)', () => {
    const idOutro = (id: string): string => `https://steamcommunity.com/openid/id/${id}`;

    it.each([
      ['mode diferente de id_res', { 'openid.mode': 'setup_needed' }],
      ['sem mode', { 'openid.mode': undefined }],
      ['ns diferente', { 'openid.ns': 'http://specs.openid.net/auth/1.1' }],
      [
        'op_endpoint que não é o da Steam',
        { 'openid.op_endpoint': 'https://evil.example/openid/login' },
      ],
      [
        'op_endpoint com prefixo da Steam',
        { 'openid.op_endpoint': 'https://steamcommunity.com.evil.example/openid/login' },
      ],
      ['return_to diferente do montado', { 'openid.return_to': `${RETURN_TO}&extra=1` }],
      [
        'return_to de outro state',
        { 'openid.return_to': 'http://localhost:3333/api/integracoes/steam/retorno?state=OUTRO' },
      ],
      [
        'claimed_id em http',
        { 'openid.claimed_id': `http://steamcommunity.com/openid/id/${STEAM_ID}` },
      ],
      [
        'claimed_id de outro host',
        { 'openid.claimed_id': `https://evil.example/openid/id/${STEAM_ID}` },
      ],
      ['claimed_id com 16 dígitos', { 'openid.claimed_id': idOutro('7656119000000000') }],
      ['claimed_id com 18 dígitos', { 'openid.claimed_id': idOutro('765611900000000000') }],
      ['claimed_id sem o prefixo 7656', { 'openid.claimed_id': idOutro('12345678901234567') }],
      ['claimed_id com lixo no fim', { 'openid.claimed_id': `${idOutro(STEAM_ID)}/extra` }],
      ['identity diferente do claimed_id', { 'openid.identity': idOutro('76561190000000001') }],
      ['sem identity', { 'openid.identity': undefined }],
      [
        'signed sem claimed_id',
        { 'openid.signed': 'signed,op_endpoint,identity,return_to,response_nonce' },
      ],
      [
        'signed sem identity',
        { 'openid.signed': 'signed,op_endpoint,claimed_id,return_to,response_nonce' },
      ],
      [
        'signed sem return_to',
        { 'openid.signed': 'signed,op_endpoint,claimed_id,identity,response_nonce' },
      ],
      [
        'signed sem op_endpoint',
        { 'openid.signed': 'signed,claimed_id,identity,return_to,response_nonce' },
      ],
      [
        'signed sem response_nonce',
        { 'openid.signed': 'signed,op_endpoint,claimed_id,identity,return_to' },
      ],
      ['sem signed', { 'openid.signed': undefined }],
      ['sem sig', { 'openid.sig': undefined }],
      ['sig vazia', { 'openid.sig': '' }],
      ['sem assoc_handle', { 'openid.assoc_handle': undefined }],
      ['sem response_nonce', { 'openid.response_nonce': undefined }],
      [
        'parâmetro openid.* repetido',
        { 'openid.claimed_id': [idOutro(STEAM_ID), idOutro('76561190000000001')] },
      ],
    ])('%s → OpenIdInvalidoError', async (_nome, overrides) => {
      const query = retornoValido(overrides);
      for (const [chave, valor] of Object.entries(overrides)) {
        if (valor === undefined) {
          delete query[chave];
        }
      }

      await expect(openId.validarRetorno(query, RETURN_TO)).rejects.toBeInstanceOf(
        OpenIdInvalidoError,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('um retorno sem nenhum parâmetro openid.* → OpenIdInvalidoError', async () => {
      await expect(openId.validarRetorno({ state: 'x' }, RETURN_TO)).rejects.toBeInstanceOf(
        OpenIdInvalidoError,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('validarRetorno — a Steam não confirma', () => {
    it('is_valid:false → OpenIdInvalidoError, e a Steam é chamada UMA vez só (sem retry, CA-11)', async () => {
      fetchMock.mockResolvedValueOnce(
        textoDaSteam('ns:http://specs.openid.net/auth/2.0\nis_valid:false\n'),
      );

      await expect(openId.validarRetorno(retornoValido(), RETURN_TO)).rejects.toBeInstanceOf(
        OpenIdInvalidoError,
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['sem a linha is_valid', 'ns:http://specs.openid.net/auth/2.0\n'],
      ['corpo vazio', ''],
      ['is_valid duplicado (ambíguo)', 'is_valid:false\nis_valid:true\n'],
      ['is_valid com outro valor', 'is_valid:TRUE\n'],
    ])('%s → OpenIdInvalidoError', async (_nome, corpo) => {
      fetchMock.mockResolvedValueOnce(textoDaSteam(corpo));

      await expect(openId.validarRetorno(retornoValido(), RETURN_TO)).rejects.toBeInstanceOf(
        OpenIdInvalidoError,
      );
    });
  });

  describe('validarRetorno — a Steam fora do ar (CA-12)', () => {
    it.each([
      ['500', () => textoDaSteam('erro', 500)],
      ['503', () => textoDaSteam('erro', 503)],
      ['302 (redirect não é seguido)', () => textoDaSteam('', 302)],
    ])('%s → PlataformaIndisponivelError', async (_nome, criar) => {
      fetchMock.mockResolvedValueOnce(criar());

      await expect(openId.validarRetorno(retornoValido(), RETURN_TO)).rejects.toBeInstanceOf(
        PlataformaIndisponivelError,
      );
    });

    it('429 → PlataformaLimiteError', async () => {
      fetchMock.mockResolvedValueOnce(textoDaSteam('', 429));

      await expect(openId.validarRetorno(retornoValido(), RETURN_TO)).rejects.toBeInstanceOf(
        PlataformaLimiteError,
      );
    });

    it.each([
      ['timeout', Object.assign(new Error('demorou'), { name: 'TimeoutError' })],
      ['falha de rede', new TypeError('fetch failed')],
    ])('%s → PlataformaIndisponivelError', async (_nome, falha) => {
      fetchMock.mockRejectedValueOnce(falha);

      await expect(openId.validarRetorno(retornoValido(), RETURN_TO)).rejects.toBeInstanceOf(
        PlataformaIndisponivelError,
      );
    });
  });

  describe('o log nunca tem o SteamID, o state nem a assinatura (CA-58)', () => {
    it.each([
      ['sucesso', () => textoDaSteam('is_valid:true')],
      ['is_valid:false', () => textoDaSteam('is_valid:false')],
      ['500', () => textoDaSteam('erro', 500)],
      ['429', () => textoDaSteam('', 429)],
    ])('%s', async (_nome, criar) => {
      fetchMock.mockResolvedValueOnce(criar());

      await openId.validarRetorno(retornoValido(), RETURN_TO).catch(() => undefined);

      const impresso = logCalls.join('\n');
      expect(impresso).not.toContain(STEAM_ID);
      expect(impresso).not.toContain('STATE.SINTETICO');
      expect(impresso).not.toContain('ASSINATURASINTETICA');
      expect(impresso).not.toContain('NONCESINTETICO');
    });

    it('a mensagem do erro de validação não carrega o SteamID nem o state', async () => {
      const erro = (await openId
        .validarRetorno(retornoValido({ 'openid.return_to': 'outro' }), RETURN_TO)
        .catch((e: unknown) => e)) as Error;

      expect(`${erro.name} ${erro.message}`).not.toContain(STEAM_ID);
      expect(`${erro.name} ${erro.message}`).not.toContain('STATE.SINTETICO');
    });
  });
});
