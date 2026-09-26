import { type CSSProperties } from 'react';

const TEXTO: CSSProperties = { fill: 'var(--color-texto)' };
const FUNDO: CSSProperties = { fill: 'var(--color-fundo)' };
const OURO: CSSProperties = { fill: 'var(--color-ouro)' };
const TRACO: CSSProperties = { stroke: 'var(--color-texto)' };
const TRACO_OURO: CSSProperties = { stroke: 'var(--color-ouro)' };

/** Bochechas: as mesmas em todas as expressões (só olhos, boca e adereços mudam). */
function Bochechas({ y = 296 }: { y?: number }) {
  return (
    <>
      <circle cx="188" cy={y} r="11" style={OURO} fillOpacity="0.5" />
      <circle cx="324" cy={y} r="11" style={OURO} fillOpacity="0.5" />
    </>
  );
}

/** Os olhos do mestre, também usados no cadeado. */
function OlhosAbertos() {
  return (
    <>
      <ellipse cx="220" cy="248" rx="21" ry="28" style={TEXTO} />
      <ellipse cx="292" cy="248" rx="21" ry="28" style={TEXTO} />
      <ellipse cx="226" cy="254" rx="11" ry="15" style={FUNDO} />
      <ellipse cx="298" cy="254" rx="11" ry="15" style={FUNDO} />
      <circle cx="230" cy="247" r="4.5" style={TEXTO} />
      <circle cx="302" cy="247" r="4.5" style={TEXTO} />
    </>
  );
}

export function RostoFeliz() {
  return (
    <>
      <OlhosAbertos />
      <Bochechas />
      <path
        d="M238 298 Q256 318 274 298"
        fill="none"
        style={TRACO}
        strokeWidth="8"
        strokeLinecap="round"
      />
    </>
  );
}

export function RostoDormindo() {
  return (
    <>
      <path
        d="M199 250 Q220 272 241 250"
        fill="none"
        style={TRACO}
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M271 250 Q292 272 313 250"
        fill="none"
        style={TRACO}
        strokeWidth="9"
        strokeLinecap="round"
      />
      <Bochechas />
      <ellipse cx="256" cy="304" rx="9" ry="7" fill="none" style={TRACO} strokeWidth="7" />
      <path
        d="M304 200 h24 l-24 28 h24"
        fill="none"
        style={TRACO_OURO}
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M328 186 h14 l-14 17 h14"
        fill="none"
        style={TRACO_OURO}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

export function RostoConfuso() {
  return (
    <>
      <ellipse cx="216" cy="250" rx="24" ry="31" style={TEXTO} />
      <ellipse cx="292" cy="256" rx="16" ry="22" style={TEXTO} />
      <ellipse cx="222" cy="256" rx="12" ry="17" style={FUNDO} />
      <ellipse cx="296" cy="260" rx="8" ry="12" style={FUNDO} />
      <circle cx="227" cy="248" r="5" style={TEXTO} />
      <circle cx="299" cy="254" r="3.5" style={TEXTO} />
      <path d="M268 220 L316 204" fill="none" style={TRACO} strokeWidth="7" strokeLinecap="round" />
      <Bochechas y={298} />
      <path
        d="M228 308 q14 -14 28 0 t28 0"
        fill="none"
        style={TRACO}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M388 128 Q388 104 410 104 Q432 104 432 124 Q432 138 416 146 Q410 150 410 160"
        fill="none"
        style={TRACO_OURO}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <circle cx="410" cy="182" r="6.5" style={OURO} />
    </>
  );
}

/** `ouro` é o degradê dourado do corpo (`url(#…)` vindo do componente pai). */
export function RostoComemorando({ ouro }: { ouro: string }) {
  return (
    <>
      <path
        d="M196 262 Q220 224 244 262"
        fill="none"
        style={TRACO}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M268 262 Q292 224 316 262"
        fill="none"
        style={TRACO}
        strokeWidth="10"
        strokeLinecap="round"
      />
      <Bochechas y={298} />
      <path
        d="M232 290 Q256 338 280 290 Z"
        style={{ ...TEXTO, ...TRACO }}
        strokeLinejoin="round"
        strokeWidth="6"
      />
      <path
        d="M96 150 Q96 172 74 172 Q96 172 96 194 Q96 172 118 172 Q96 172 96 150 Z"
        fill={ouro}
        stroke={ouro}
        strokeWidth="6"
        strokeLinejoin="round"
      />
      <path
        d="M424 116 Q424 144 396 144 Q424 144 424 172 Q424 144 452 144 Q424 144 424 116 Z"
        fill={ouro}
        stroke={ouro}
        strokeWidth="6"
        strokeLinejoin="round"
      />
      <path
        d="M432 236 Q432 250 418 250 Q432 250 432 264 Q432 250 446 250 Q432 250 432 236 Z"
        fill={ouro}
        stroke={ouro}
        strokeWidth="5"
        strokeLinejoin="round"
      />
    </>
  );
}

export function RostoCadeado({ ouro }: { ouro: string }) {
  return (
    <>
      <OlhosAbertos />
      <Bochechas />
      <path
        d="M243 296 v-9 a13 13 0 0 1 26 0 v9"
        fill="none"
        stroke={ouro}
        strokeWidth="7"
        strokeLinecap="round"
      />
      <rect x="234" y="294" width="44" height="34" rx="8" fill={ouro} />
      <circle cx="256" cy="308" r="5" style={FUNDO} />
      <rect x="254" y="309" width="4" height="10" rx="2" style={FUNDO} />
    </>
  );
}
