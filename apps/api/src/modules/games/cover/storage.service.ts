import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { badGatewayError } from '../../../common/errors/api-error';
import { type EnvironmentVariables } from '../../../config/env.validation';
import { COVER_STORAGE_FAILURE } from './cover-messages';

const REQUEST_TIMEOUT_MS = 10_000;
const LOGGED_MESSAGE_MAX = 200;

/** Cada segmento do caminho é codificado; as barras entre eles ficam. */
function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

/**
 * Fala com a API REST do Supabase Storage pelo `fetch` nativo (sem `@supabase/supabase-js`).
 * Autenticação: só o cabeçalho `apikey` com a secret key, como a documentação oficial manda — a
 * secret key não é um JWT e não vai em `Authorization: Bearer`.
 * https://supabase.com/docs/guides/getting-started/api-keys
 *
 * Isolado atrás de `upload`/`remove`/`publicUrl` para o GamesService e os testes o mockarem.
 * Falha do storage vira 502 com mensagem fixa (nunca repassa o corpo da resposta do Supabase).
 * O log tem status HTTP e mensagem: nunca cabeçalhos nem a chave.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly storageUrl: string;
  private readonly bucket: string;
  private readonly apiKey: string;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.storageUrl = `${config.get('SUPABASE_URL', { infer: true }).replace(/\/+$/, '')}/storage/v1`;
    this.bucket = config.get('SUPABASE_STORAGE_BUCKET', { infer: true });
    this.apiKey = config.get('SUPABASE_SERVICE_ROLE_KEY', { infer: true });
  }

  /** URL pública do objeto (bucket público): montada localmente, sem chamada de rede. */
  publicUrl(path: string): string {
    return `${this.storageUrl}/object/public/${encodeURIComponent(this.bucket)}/${encodePath(path)}`;
  }

  async upload(path: string, content: Buffer, contentType: string): Promise<void> {
    await this.send(
      'upload',
      `${this.storageUrl}/object/${encodeURIComponent(this.bucket)}/${encodePath(path)}`,
      {
        method: 'POST',
        headers: {
          'content-type': contentType,
          'cache-control': 'max-age=3600',
          'x-upsert': 'false',
        },
        body: content,
      },
    );
  }

  /** Remover um objeto que não existe não é erro (o Supabase só não o lista na resposta). */
  async remove(path: string): Promise<void> {
    await this.send('remove', `${this.storageUrl}/object/${encodeURIComponent(this.bucket)}`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prefixes: [path] }),
    });
  }

  private async send(operation: string, url: string, init: RequestInit): Promise<void> {
    let response: Response;

    try {
      response = await fetch(url, {
        ...init,
        headers: { ...init.headers, apikey: this.apiKey },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // Só o tipo do erro (ex.: TimeoutError, TypeError): a mensagem de rede não tem segredo, mas
      // o objeto de erro pode carregar a requisição, então não o repassamos ao log.
      const kind = error instanceof Error ? error.name : 'erro desconhecido';
      this.logger.error(`Storage (${operation}) sem resposta: ${kind}`);
      throw badGatewayError(COVER_STORAGE_FAILURE, { arquivo: COVER_STORAGE_FAILURE });
    }

    if (!response.ok) {
      const detail = await this.readErrorMessage(response);
      this.logger.error(`Storage (${operation}) respondeu ${response.status}: ${detail}`);
      throw badGatewayError(COVER_STORAGE_FAILURE, { arquivo: COVER_STORAGE_FAILURE });
    }
  }

  /** Só o campo `message` da resposta de erro do Supabase, truncado; nunca cabeçalhos. */
  private async readErrorMessage(response: Response): Promise<string> {
    try {
      const parsed = (await response.json()) as { message?: unknown; error?: unknown };
      const text = typeof parsed.message === 'string' ? parsed.message : String(parsed.error ?? '');
      return text.slice(0, LOGGED_MESSAGE_MAX) || 'sem mensagem';
    } catch {
      return 'resposta sem JSON';
    }
  }
}
