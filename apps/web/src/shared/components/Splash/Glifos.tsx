import { type CSSProperties } from 'react';

export type TipoDeGlifo =
  'estrela' | 'controle' | 'trofeu' | 'direcional' | 'check' | 'coracao' | 'moeda' | 'botao';

const FURO: CSSProperties = { fill: 'var(--color-fundo)' };

/**
 * Os desenhos que "chegam" na tela de abertura: peças do mundo dos jogos, em SVG próprio (sem fonte de ícones, que
 * ainda não carregou nesta hora) e com `currentColor`, para a cor vir de uma classe de token.
 */
export function Glifo({ tipo }: { tipo: TipoDeGlifo }) {
  return (
    <svg viewBox="0 0 32 32" className="size-full" fill="currentColor" aria-hidden="true">
      {tipo === 'estrela' && (
        <path d="M16 3l3.9 8.2 9 1.2-6.6 6.2 1.7 8.9L16 22.9 8 27.5l1.7-8.9L3.1 12.4l9-1.2z" />
      )}
      {tipo === 'controle' && (
        <>
          <path d="M9 9h14a7 7 0 0 1 6.8 8.6l-1.2 5.6a3.3 3.3 0 0 1-5.6 1.6L20 22h-8l-3 2.8a3.3 3.3 0 0 1-5.6-1.6l-1.2-5.6A7 7 0 0 1 9 9z" />
          <path d="M9.6 12.8v1.7H8v1.8h1.6V18h1.8v-1.7H13v-1.8h-1.6v-1.7z" style={FURO} />
          <circle cx="21.6" cy="14.2" r="1.4" style={FURO} />
          <circle cx="24.4" cy="17" r="1.4" style={FURO} />
        </>
      )}
      {tipo === 'trofeu' && (
        <>
          <path d="M9 4h14v7a7 7 0 0 1-14 0z" />
          <path
            d="M9 7H5v2.5A4.5 4.5 0 0 0 9.5 14M23 7h4v2.5a4.5 4.5 0 0 1-4.5 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <path d="M14 19h4v4h4.5v3h-13v-3H14z" />
        </>
      )}
      {tipo === 'direcional' && (
        <path
          d="M12 4h8v8h8v8h-8v8h-8v-8H4v-8h8z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      )}
      {tipo === 'check' && (
        <>
          <circle cx="16" cy="16" r="13" />
          <path
            d="M9.5 16.5l4.5 4.5 8.5-9"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ stroke: 'var(--color-fundo)' }}
          />
        </>
      )}
      {tipo === 'coracao' && (
        <path d="M16 27C6 20 3 15 3 10.5A6.5 6.5 0 0 1 16 8a6.5 6.5 0 0 1 13 2.5C29 15 26 20 16 27z" />
      )}
      {tipo === 'moeda' && (
        <>
          <circle cx="16" cy="16" r="12" />
          <circle
            cx="16"
            cy="16"
            r="7.5"
            fill="none"
            strokeWidth="2.4"
            style={{ stroke: 'var(--color-fundo)' }}
          />
        </>
      )}
      {tipo === 'botao' && (
        <circle cx="16" cy="16" r="11" fill="none" stroke="currentColor" strokeWidth="3.5" />
      )}
    </svg>
  );
}
