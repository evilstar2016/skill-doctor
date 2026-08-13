// Hermes — caduceus (winged, double-snake staff) in gold.
export function HermesLogo({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="#B08D57" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v17" />
      <path d="M9.4 7c-1.5 1-1.5 3 0 4M14.6 7c1.5 1 1.5 3 0 4" />
      <path d="M6 4.2c1.6-1 3.1-1 4.2 0M18 4.2c-1.6-1-3.1-1-4.2 0" />
      <circle cx="12" cy="3" r="1.3" fill="#B08D57" stroke="none" />
    </svg>
  );
}
