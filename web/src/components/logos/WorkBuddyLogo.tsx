import { useId } from 'react';

// WorkBuddy's official app mark: a white cat silhouette, green face panel,
// and white diagonal eyes on a teal-to-lime gradient.
// Visual reference: https://apps.apple.com/cn/app/workbuddy-ai-%E5%8A%9E%E5%85%AC%E6%88%91%E5%B8%AE%E4%BD%A0/id6761374913
export function WorkBuddyLogo({ size = 18 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  const backgroundGradientId = `workbuddy-background-${id}`;
  const faceGradientId = `workbuddy-face-${id}`;
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id={backgroundGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#14C5A8" />
          <stop offset="100%" stopColor="#69D875" />
        </linearGradient>
        <linearGradient id={faceGradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#19C7A8" />
          <stop offset="100%" stopColor="#4AD477" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="98" height="98" rx="25" fill={`url(#${backgroundGradientId})`} />
      <path
        d="M2 34c11-2 20 1 29 7 10-10 22-16 34-21l8-16c1-3 4-3 6 0l10 17c4 2 8 4 11 7v17c-5-4-11-6-17-5L33 64c-8 5-10 16-4 26l6 9H22C9 98 2 87 2 72V34Z"
        fill="#ECFFF9"
      />
      <path
        d="M33 53c12-10 26-19 40-20 16-1 26 10 26 25v19c0 8-4 13-12 17l-21 6H40c-7-10-10-18-10-25 0-9 1-15 3-22Z"
        fill={`url(#${faceGradientId})`}
      />
      <rect x="45" y="66" width="9" height="21" rx="4.5" transform="rotate(-30 45 66)" fill="#F4FFFA" />
      <rect x="68" y="53" width="9" height="21" rx="4.5" transform="rotate(-30 68 53)" fill="#F4FFFA" />
    </svg>
  );
}
