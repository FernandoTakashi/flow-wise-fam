// Carolina — a capivara da CaRe Wallet. Vetor leve para ícone, loading e estados vazios.
export function Mascot({ size = 64, tile = false, className }: { size?: number; tile?: boolean; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label="Carolina, a mascote da CaRe Wallet"
    >
      {tile && <rect width="64" height="64" rx="14" fill="hsl(var(--primary))" />}
      {/* orelhas */}
      <circle cx="21" cy="16" r="5.5" fill="#b57c42" />
      <circle cx="43" cy="16" r="5.5" fill="#b57c42" />
      <circle cx="21" cy="16" r="2.4" fill="#8a5a2c" />
      <circle cx="43" cy="16" r="2.4" fill="#8a5a2c" />
      {/* cabeça */}
      <rect x="12" y="13" width="40" height="37" rx="16" fill="#d89a63" />
      {/* focinho */}
      <rect x="17" y="31" width="30" height="18" rx="11" fill="#f0dcbb" />
      {/* olhos */}
      <circle cx="24" cy="25" r="2.8" fill="#3b2a1d" />
      <circle cx="40" cy="25" r="2.8" fill="#3b2a1d" />
      {/* narinas + boca */}
      <circle cx="28" cy="39" r="1.7" fill="#7a5230" />
      <circle cx="36" cy="39" r="1.7" fill="#7a5230" />
      <path d="M32 42v3M28 46q4 3 8 0" stroke="#7a5230" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* moeda */}
      <circle cx="48" cy="47" r="9" fill="#f5c542" stroke="#dba61f" strokeWidth="2" />
      <text x="48" y="51.5" textAnchor="middle" fontFamily="Georgia, serif" fontSize="11" fontWeight={700} fill="#8c6910">$</text>
    </svg>
  );
}
