import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { createValidationPipe } from './common/pipes/app-validation.pipe';
import { API_GLOBAL_PREFIX, SWAGGER_PATH, parseCorsOrigin } from './config/app.config';
import { DEFAULT_TRUST_PROXY_HOPS, type EnvironmentVariables } from './config/env.validation';

/**
 * Tudo o que o `main.ts` liga na aplicação, à parte para os testes e a verificação manual subirem a
 * MESMA configuração (prefixo, cookie, CORS, pipe, Swagger) em vez de uma cópia que pode divergir.
 */
export function setupApp(app: INestApplication): void {
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  app.setGlobalPrefix(API_GLOBAL_PREFIX);

  // Sem isto o `req.ip` é o endereço do socket, que atrás de Vercel → Render é o do proxy: o limite por IP
  // (`ThrottlerGuard`) agrupava todos os usuários num contador só. Um NÚMERO de saltos (nunca `true`, que
  // confia em qualquer `X-Forwarded-For` e deixa o IP forjável): o Express só olha os últimos N endereços.
  (app as NestExpressApplication).set(
    'trust proxy',
    config.get('TRUST_PROXY_HOPS', { infer: true }) ?? DEFAULT_TRUST_PROXY_HOPS,
  );

  // Lê o cookie do refresh token (`checkpoint_refresh`).
  app.use(cookieParser());

  // `credentials: true` + lista de origens (nunca `*`, recusado no boot): o cookie de sessão só vai e
  // volta para as origens listadas.
  app.enableCors({
    origin: parseCorsOrigin(config.get('CORS_ORIGIN', { infer: true })),
    credentials: true,
  });

  app.useGlobalPipes(createValidationPipe());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Checkpoint API')
    .setDescription('API do checkpoint — registro de jogos zerados, jogando e para jogar')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  SwaggerModule.setup(
    `${API_GLOBAL_PREFIX}/${SWAGGER_PATH}`,
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );
}
