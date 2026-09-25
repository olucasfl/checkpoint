import { plainToInstance, Transform, type TransformFnParams } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/** Tamanho mínimo de cada segredo de assinatura dos tokens (spec autenticacao). */
export const JWT_SECRET_MIN_LENGTH = 32;

/** Limite de registros por hora e por IP quando `AUTH_REGISTRATION_LIMIT_PER_HOUR` não está definida. */
export const DEFAULT_REGISTRATION_LIMIT_PER_HOUR = 3;

/** Só a origem: `http(s)://host[:porta]`, sem barra final, caminho, query nem espaço. */
const ORIGIN_PATTERN = /^https?:\/\/[^\s/?#]+$/;
const ORIGIN_MESSAGE = (name: string) =>
  `${name} deve ser uma origem http(s) sem barra final nem caminho, ex.: http://localhost:3333`;

/** Saltos de proxy confiáveis quando `TRUST_PROXY_HOPS` não está definida: nenhum. */
export const DEFAULT_TRUST_PROXY_HOPS = 0;

const CORS_WILDCARD_MESSAGE =
  'CORS_ORIGIN não pode ser * com cookies de sessão; liste as origens, ex.: http://localhost:5173';

/**
 * Lê `true`/`false` do texto cru da env. `enableImplicitConversion` transformaria "false" em `true`
 * (`Boolean("false")`), então o valor cru é usado e qualquer outro texto falha no `@IsBoolean`.
 */
const StrictBoolean = () =>
  Transform(({ obj, key }: TransformFnParams) => {
    const raw: unknown = obj[key];
    if (raw === 'true' || raw === true) {
      return true;
    }
    if (raw === 'false' || raw === false) {
      return false;
    }
    return raw;
  });

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

  /** Origens permitidas, separadas por vírgula. Obrigatória e sem `*` (ver `extraProblems`). */
  @IsString()
  @IsNotEmpty()
  CORS_ORIGIN: string;

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

  /** Segredo do access token (HS256). Diferente do `JWT_REFRESH_SECRET`. */
  @IsString()
  @MinLength(JWT_SECRET_MIN_LENGTH, {
    message: `JWT_ACCESS_SECRET deve ter pelo menos ${JWT_SECRET_MIN_LENGTH} caracteres`,
  })
  JWT_ACCESS_SECRET: string;

  /** Segredo do refresh token (HS256), separado para um token não valer no lugar do outro. */
  @IsString()
  @MinLength(JWT_SECRET_MIN_LENGTH, {
    message: `JWT_REFRESH_SECRET deve ter pelo menos ${JWT_SECRET_MIN_LENGTH} caracteres`,
  })
  JWT_REFRESH_SECRET: string;

  /** Registro de contas novas aberto (`true`) ou fechado (`false`). Sem padrão: é uma decisão. */
  @StrictBoolean()
  @IsBoolean({ message: 'AUTH_REGISTRATION_OPEN deve ser true ou false' })
  AUTH_REGISTRATION_OPEN: boolean;

  /** Só para dev/teste. Ausente = `DEFAULT_REGISTRATION_LIMIT_PER_HOUR`. */
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_REGISTRATION_LIMIT_PER_HOUR?: number;

  /**
   * Chave da Steam Web API (spec integracao-plataformas): 32 hexadecimais. SÓ o backend a usa e ela viaja
   * na query string das chamadas, então nunca vai para o web nem para log. A mensagem de erro não ecoa o valor.
   */
  @Matches(/^[0-9a-fA-F]{32}$/, {
    message: 'STEAM_API_KEY deve ter 32 caracteres hexadecimais (a chave da Steam Web API)',
  })
  STEAM_API_KEY: string;

  /**
   * Endereço em que o NAVEGADOR alcança a API, usado no `return_to` e no `realm` do OpenID da Steam. Em
   * produção é o domínio da Vercel (o `/api` passa pelo rewrite até o Render), não o do Render: o cookie do
   * vínculo é gravado no host da Vercel e só volta para ele. Origem sem barra final e sem caminho.
   */
  @Matches(ORIGIN_PATTERN, { message: ORIGIN_MESSAGE('API_PUBLIC_URL') })
  API_PUBLIC_URL: string;

  /** Origem do web, para onde o retorno do vínculo redireciona (`/perfil?steam=…`). Sem barra final. */
  @Matches(ORIGIN_PATTERN, { message: ORIGIN_MESSAGE('WEB_PUBLIC_URL') })
  WEB_PUBLIC_URL: string;

  /**
   * Quantos proxies CONFIÁVEIS existem entre o cliente e a API (Vercel, Render…). Ausente = 0: o
   * `X-Forwarded-For` é ignorado e o `req.ip` é o do socket (dev, sem proxy). Um número MENOR que o real deixa
   * o limite por IP quebrado (todo mundo com o IP do proxy); MAIOR deixa o cabeçalho forjável. Por isso é
   * um número medido, nunca `true` (que confiaria em qualquer cabeçalho): ver `ARCHITECTURE.md` §4.1.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  TRUST_PROXY_HOPS?: number;
}

/** Regras que envolvem mais de uma variável (ou uma lista), fora do alcance de um decorator só. */
function extraProblems(config: EnvironmentVariables): string[] {
  const problems: string[] = [];

  if (
    typeof config.JWT_ACCESS_SECRET === 'string' &&
    config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET
  ) {
    problems.push(
      '  - JWT_REFRESH_SECRET: deve ser diferente de JWT_ACCESS_SECRET (segredos separados)',
    );
  }

  if (
    typeof config.CORS_ORIGIN === 'string' &&
    config.CORS_ORIGIN.split(',').some((origin) => origin.trim() === '*')
  ) {
    problems.push(`  - CORS_ORIGIN: ${CORS_WILDCARD_MESSAGE}`);
  }

  return problems;
}

/**
 * Executada pelo ConfigModule no boot: derruba a aplicacao se alguma variavel
 * de ambiente obrigatoria estiver ausente ou invalida. A mensagem lista o problema de cada variavel
 * e NUNCA o valor (segredos).
 */
export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });

  const errors = validateSync(validatedConfig, { skipMissingProperties: false });

  const details = [
    ...errors.map(
      (error) => `  - ${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`,
    ),
    ...extraProblems(validatedConfig),
  ];

  if (details.length > 0) {
    throw new Error(`Variaveis de ambiente invalidas:\n${details.join('\n')}`);
  }

  return validatedConfig;
}
