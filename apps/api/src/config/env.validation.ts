import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsNotEmpty, IsString, Max, Min, validateSync } from 'class-validator';

export enum Environment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3333;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  CORS_ORIGIN: string = '*';
}

/**
 * Executada pelo ConfigModule no boot: derruba a aplicacao se alguma variavel
 * de ambiente obrigatoria estiver ausente ou invalida.
 */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });

  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((error) => `  - ${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`)
      .join('\n');

    throw new Error(`Variaveis de ambiente invalidas:\n${details}`);
  }

  return validatedConfig;
}
