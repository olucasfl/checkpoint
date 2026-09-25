import { type ReactNode } from 'react';
import { BrandLogo } from '@/shared/components/BrandLogo';

interface AuthCardProps {
  title: string;
  children: ReactNode;
}

/** Cartão central das telas de entrada: logo, título e o formulário, em até 420 px de largura. */
export function AuthCard({ title, children }: AuthCardProps) {
  return (
    <section className="relative flex w-full max-w-[420px] flex-col gap-5 rounded-md border border-borda bg-painel p-6 md:p-8">
      <BrandLogo />
      <h1 className="m-0 text-center font-display text-[15px] font-extrabold uppercase tracking-[0.2em] text-texto-suave">
        {title}
      </h1>
      {children}
    </section>
  );
}

/** O botão principal do cartão: `destaque` com texto `fundo`, altura de 52 px. */
export const PRIMARY_BUTTON =
  'h-[52px] w-full rounded-[4px] bg-destaque px-6 font-display text-sm font-extrabold uppercase tracking-[0.1em] text-fundo disabled:cursor-wait disabled:opacity-60';

/** Link secundário do cartão ("Criar conta", "Já tenho conta"), com alvo de 44 px. */
export const SECONDARY_LINK =
  'flex min-h-11 items-center justify-center rounded-[4px] text-[16px] font-semibold text-destaque underline underline-offset-4';
