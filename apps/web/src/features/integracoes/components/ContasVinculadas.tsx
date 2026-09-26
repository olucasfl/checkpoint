import { ContaSteamCard } from './ContaSteamCard';

/**
 * A seção "Contas vinculadas" do `/perfil` (entre "Conta" e "Preferências"): hoje só a Steam. Outras plataformas
 * entram como cartões novos aqui, cada um com o seu provedor.
 */
export function ContasVinculadas() {
  return (
    <section aria-label="Contas vinculadas" className="flex flex-col gap-2">
      <h2 className="m-0 px-1 font-display text-sm font-bold uppercase tracking-[0.14em] text-texto-suave">
        Contas vinculadas
      </h2>
      <div className="overflow-hidden rounded-2xl bg-painel">
        <ContaSteamCard />
      </div>
    </section>
  );
}
