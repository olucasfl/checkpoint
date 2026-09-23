import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { createValidationPipe } from './common/pipes/app-validation.pipe';
import { API_GLOBAL_PREFIX, SWAGGER_PATH, parseCorsOrigin } from './config/app.config';
import { type EnvironmentVariables } from './config/env.validation';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<EnvironmentVariables, true>>(ConfigService);

  app.setGlobalPrefix(API_GLOBAL_PREFIX);

  app.enableCors({
    origin: parseCorsOrigin(config.get('CORS_ORIGIN', { infer: true })),
    credentials: true,
  });

  app.useGlobalPipes(createValidationPipe());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Checkpoint API')
    .setDescription('API do checkpoint — registro de jogos zerados, jogando e para jogar')
    .setVersion('0.1.0')
    .build();

  SwaggerModule.setup(
    `${API_GLOBAL_PREFIX}/${SWAGGER_PATH}`,
    app,
    SwaggerModule.createDocument(app, swaggerConfig),
  );

  const port = config.get('PORT', { infer: true });
  await app.listen(port);

  Logger.log(`API em http://localhost:${port}/${API_GLOBAL_PREFIX}`, 'Bootstrap');
  Logger.log(
    `Swagger em http://localhost:${port}/${API_GLOBAL_PREFIX}/${SWAGGER_PATH}`,
    'Bootstrap',
  );
}

void bootstrap();
