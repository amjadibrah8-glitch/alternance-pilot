/** Score IA : le chiffre est l'élément fort de l'interface, la barre donne l'échelle. */
export function Score({ value, size = "lg" }: { value: number | null; size?: "lg" | "sm" }) {
  if (value === null) return <span className="num text-sm text-muted">en analyse</span>;
  const tone = value >= 75 ? "var(--accent)" : value >= 50 ? "var(--warn)" : "var(--bad)";
  return (
    <div className={size === "lg" ? "w-16" : "w-10"}>
      <div className={`num font-semibold leading-none ${size === "lg" ? "text-3xl" : "text-base"}`} style={{ color: tone }}>
        {value}
      </div>
      <div className="mt-2 h-1 rounded-full bg-line" aria-hidden>
        <div className="h-1 rounded-full" style={{ width: `${value}%`, background: tone }} />
      </div>
      <span className="sr-only">Score de pertinence : {value} sur 100</span>
    </div>
  );
}
