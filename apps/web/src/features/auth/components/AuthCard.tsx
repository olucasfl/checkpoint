import { type ReactNode } from 'react';
import { BrandLogo } from '@/shared/components/BrandLogo';
import { Chek } from '@/shared/components/Chek/Chek';

interface AuthCardProps {
  title: string;
  children: ReactNode;
}

/** Telas de entrada: o Chek (96 px) acima do cartão com o nome, o título e o formulário, em até 420 px de largura. */
export function AuthCard({ title, children }: AuthCardProps) {
  return (
    <div className="relative flex w-full max-w-[420px] flex-col items-center gap-4">
      <Chek altura={96} />
      <section className="flex w-full flex-col gap-5 rounded-2xl border border-borda bg-painel p-6 md:p-8">
        <BrandLogo mostrarChek={false} />
        <h1 className="m-0 text-center font-display text-xl font-extrabold tracking-[-0.01em]">
          {title}
        </h1>
        {children}
      </section>
    </div>
  );
}

/** O botão principal do cartão: `destaque` com texto `fundo`, altura de 52 px. */
export const PRIMARY_BUTTON =
  'h-[52px] w-full rounded-full bg-destaque px-6 font-display text-base font-extrabold text-fundo transition-transform hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60';

/** Link secundário do cartão ("Criar conta", "Já tenho conta"), com alvo de 44 px. */
export const SECONDARY_LINK =
  'flex min-h-11 items-center justify-center rounded-full text-[16px] font-semibold text-destaque underline underline-offset-4';
