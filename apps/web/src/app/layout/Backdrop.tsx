/** O fundo Neon (orbes + scanlines), decorativo, das telas do app e das de entrada. */
export function Backdrop() {
  return (
    <>
      <div
        aria-hidden="true"
        className="orb orb-magenta -right-[160px] -top-[200px] size-[420px] md:-right-[220px] md:-top-[280px] md:size-[720px]"
      />
      <div
        aria-hidden="true"
        className="orb orb-ciano -bottom-[220px] -left-[180px] size-[420px] md:-bottom-[320px] md:-left-[260px] md:size-[760px]"
      />
      <div aria-hidden="true" className="scanlines" />
    </>
  );
}
