import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';

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

  /** Base do projeto Supabase (Storage das capas). */
  @IsUrl({ require_tld: false, require_protocol: true, protocols: ['http', 'https'] })
  SUPABASE_URL: string;

  /**
   * Chave usada SO pelo backend para escrever no Storage (nunca vai para o web nem para log).
   * O nome e mantido, mas o valor esperado e a secret key nova (sb_secret_...) ou a service_role
   * legada. A publishable (sb_publishable_...) e a chave publica, sujeita a RLS: com o bucket sem
   * policies todo upload falharia com 403, entao o boot a recusa em vez de falhar so no upload.
   */
  @IsString()
  @IsNotEmpty()
  @Matches(/^(?!sb_publishable_)/, {
    message:
      'SUPABASE_SERVICE_ROLE_KEY parece a chave publishable; use a secret key (sb_secret_…) ou a service_role legada',
  })
  SUPABASE_SERVICE_ROLE_KEY: string;

  @IsString()
  @IsNotEmpty()
  SUPABASE_STORAGE_BUCKET: string;
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
