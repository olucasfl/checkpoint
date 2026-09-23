import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { GAME_COVER_FIELD, GAME_COVER_MAX_BYTES } from '@checkpoint/shared';
import { badRequestError, payloadTooLargeError } from '../../../common/errors/api-error';
import { COVER_MISSING, COVER_TOO_LARGE } from './cover-messages';

const UploadInterceptor = FileInterceptor(GAME_COVER_FIELD, {
  limits: { fileSize: GAME_COVER_MAX_BYTES, files: 1 },
});

/**
 * Embrulha o FileInterceptor do Nest (que já usa o multer, sem importá-lo daqui) só para converter
 * os erros de leitura do multipart em ApiErrorResponse com `fields.arquivo`: arquivo acima do limite
 * → 413, campo com outro nome ou multipart malformado → 400.
 *
 * O interceptor interno só lê o multipart durante o `await`; erros do handler chegam pelo
 * Observable, então este try/catch nunca os captura.
 *
 * Ordem no Nest: interceptors rodam ANTES dos pipes. Por isso o 413/400 do multipart vem antes do
 * `ParseUUIDPipe` do `:id` (um arquivo grande para um id inválido dá 413, não 400).
 */
@Injectable()
export class CoverUploadInterceptor implements NestInterceptor {
  private readonly inner = new UploadInterceptor();

  async intercept(context: ExecutionContext, next: CallHandler) {
    try {
      return await this.inner.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) {
        throw payloadTooLargeError(COVER_TOO_LARGE, { arquivo: COVER_TOO_LARGE });
      }
      if (error instanceof BadRequestException) {
        throw badRequestError(COVER_MISSING, { arquivo: COVER_MISSING });
      }
      throw error;
    }
  }
}
