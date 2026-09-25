import { TrocarSenhaForm } from '@/features/auth/components/TrocarSenhaForm';

/** `/perfil/senha`: dentro do `AppLayout` e do `RequireAuth`, num cartão de até 420 px. */
export function TrocarSenhaPage() {
  return (
    <div className="safe-x pb-12 pt-6 md:pb-16 md:pt-10">
      <main className="relative mx-auto flex max-w-[420px] flex-col gap-5">
        <h1 className="glow-text-destaque m-0 font-display text-[22px] font-extrabold tracking-[0.14em] md:text-[30px]">
          TROCAR SENHA
        </h1>
        <section className="flex flex-col gap-4 rounded-md border border-borda bg-painel p-5 md:p-6">
          <TrocarSenhaForm />
        </section>
      </main>
    </div>
  );
}
