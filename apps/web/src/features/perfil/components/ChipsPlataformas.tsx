import { FieldError } from '@/shared/components/form-parts';
import { PLATFORM_GROUPS } from '@/features/games/lib/platforms';
import { MAX_FAVORITAS } from '@/shared/lib/prefs/prefs';

export const AVISO_LIMITE_FAVORITAS = `Até ${MAX_FAVORITAS} favoritas`;

interface ChipsPlataformasProps {
  favoritas: readonly string[];
  /** `false` quando o limite barrou a marcação (a 9ª não marca): quem chama mostra o aviso. */
  aviso: string;
  onAlternar: (plataforma: string, marcar: boolean) => void;
}

/**
 * As plataformas favoritas como chips por família. `aria-pressed` diz se está marcada; o limite de 8
 * e o aviso ficam com quem chama, que é quem grava a preferência.
 */
export function ChipsPlataformas({ favoritas, aviso, onAlternar }: ChipsPlataformasProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[15px] text-texto-suave">
        Aparecem primeiro na escolha da plataforma, ao cadastrar um jogo.{' '}
        <span className="font-semibold text-texto">
          {favoritas.length} de {MAX_FAVORITAS}
        </span>
      </p>
      <FieldError id="pref-favoritas-aviso" message={aviso} />
      {PLATFORM_GROUPS.map((grupo) => (
        <div
          key={grupo.label}
          role="group"
          aria-label={grupo.label}
          className="flex flex-col gap-2"
        >
          <div className="text-sm font-bold uppercase tracking-[0.14em] text-texto-suave">
            {grupo.label}
          </div>
          <div className="flex flex-wrap gap-2">
            {grupo.platforms.map((plataforma) => {
              const marcada = favoritas.includes(plataforma);
              return (
                <button
                  key={plataforma}
                  type="button"
                  aria-pressed={marcada}
                  onClick={() => onAlternar(plataforma, !marcada)}
                  className={`min-h-11 rounded-full border px-4 text-[16px] font-semibold ${
                    marcada
                      ? 'border-destaque bg-destaque text-fundo'
                      : 'border-borda-controle text-texto hover:bg-acao-hover'
                  }`}
                >
                  {plataforma}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
