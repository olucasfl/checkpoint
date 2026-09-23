interface IconProps {
  /** Nome do glifo no Material Symbols Rounded (ex.: "flag", "edit"). */
  name: string;
  /** Tamanho em px. */
  size?: number;
  /** Versão preenchida do glifo. */
  filled?: boolean;
  className?: string;
}

/**
 * Ícone decorativo: sempre `aria-hidden`. Um botão só com ícone leva `aria-label` no próprio botão
 * (spec, "Acessibilidade").
 */
export function Icon({ name, size = 20, filled = false, className = '' }: IconProps) {
  return (
    <span
      aria-hidden="true"
      className={`icon${filled ? ' icon-fill' : ''}${className ? ` ${className}` : ''}`}
      style={{ fontSize: size }}
    >
      {name}
    </span>
  );
}
