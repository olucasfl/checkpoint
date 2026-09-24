const MAX_LENGTH = 80;
const UNKNOWN = 'Outro';

// A ordem importa: o Edge e o Samsung Internet dizem "Chrome" no User-Agent, e o Chrome diz "Safari".
const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg(?:e|A|iOS)?\//, 'Edge'],
  [/SamsungBrowser\//, 'Samsung Internet'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
];

// O Android também diz "Linux", e o iPad/iPhone dizem "Mac OS X": os mais específicos vêm antes.
const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Windows/, 'Windows'],
  [/Macintosh|Mac OS X/, 'macOS'],
  [/Linux|X11/, 'Linux'],
];

function firstMatch(userAgent: string, table: ReadonlyArray<readonly [RegExp, string]>): string {
  return table.find(([pattern]) => pattern.test(userAgent))?.[1] ?? UNKNOWN;
}

/**
 * Rótulo legível da sessão a partir do `User-Agent` ("Chrome · Android"). Só navegador e sistema:
 * nada de IP nem de localização (o Oratio consultava um serviço externo por HTTP, vazando o IP).
 */
export function deviceLabel(userAgent: string | undefined): string {
  const ua = userAgent ?? '';
  return `${firstMatch(ua, BROWSERS)} · ${firstMatch(ua, SYSTEMS)}`.slice(0, MAX_LENGTH);
}
