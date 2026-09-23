/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL base da API, ja incluindo o prefixo global `/api`. */
  readonly VITE_API_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
