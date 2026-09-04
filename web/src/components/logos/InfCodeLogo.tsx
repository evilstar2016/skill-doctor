import { useId } from 'react';

// InfCode's official geometric mark, adapted from its sidebar icon.
export function InfCodeLogo({ size = 18 }: { size?: number }) {
  const id = `infcode-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 30 23" width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8292FF" />
          <stop offset="55%" stopColor="#263DFF" />
          <stop offset="100%" stopColor="#D600FF" />
        </linearGradient>
      </defs>
      <path d="M23.5192 22.5008H14.8605L21.3416 11.25L30.0003 11.2513L23.5192 22.5008Z" fill={`url(#${id})`} />
      <path d="M0 22.5008L12.9554 22.4995C12.9582 22.4995 12.9609 22.4991 12.9635 22.4982L19.4446 11.25H6.48243L0 22.5008Z" fill={`url(#${id})`} />
      <path d="M12.9596 22.499L12.9635 22.4977L19.4446 11.2495L12.9635 0H0L6.48243 11.2495L12.9596 22.499Z" fill={`url(#${id})`} />
      <path d="M6.48111 11.249H19.4446L12.9622 22.4998L6.48111 11.249Z" fill={`url(#${id})`} />
    </svg>
  );
}
