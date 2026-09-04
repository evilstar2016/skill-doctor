import type { ReactNode } from 'react';
import { ClaudeLogo } from './logos/ClaudeLogo';
import { CursorLogo } from './logos/CursorLogo';
import { CopilotLogo } from './logos/CopilotLogo';
import { CodexLogo } from './logos/CodexLogo';
import { GeminiLogo } from './logos/GeminiLogo';
import { WindsurfLogo } from './logos/WindsurfLogo';
import { TraeLogo } from './logos/TraeLogo';
import { OpenCodeLogo } from './logos/OpenCodeLogo';
import { KiroLogo } from './logos/KiroLogo';
import { OpenClawLogo } from './logos/OpenClawLogo';
import { HermesLogo } from './logos/HermesLogo';
import { InfCodeLogo } from './logos/InfCodeLogo';
import { WorkBuddyLogo } from './logos/WorkBuddyLogo';

export type PlatformLogoProps = { size?: number };
type LogoComponent = (props: PlatformLogoProps) => ReactNode;

// Brand-logo index. Each built-in platform maps to a glyph sourced from the
// real brand mark: Claude / Codex / Gemini / OpenClaw / Copilot come from the
// official assets, Cursor / Windsurf / Trae from Simple Icons, and OpenCode /
// Kiro / Hermes are authored to match their real brand identity. `custom:*`
// platforms intentionally have no logo and fall back to the monogram in
// <PlatformIcon>.
//
// Each logo now lives in its own file under ./logos so it can be edited or
// replaced independently and reviewed in isolation. Most use their fixed brand
// color; Cursor / Copilot / Windsurf / OpenCode are monochrome marks and keep
// `currentColor` so they stay visible on both light and dark themes (a fixed
// black would vanish on dark).

export const PLATFORM_LOGOS: Record<string, LogoComponent> = {
  claude: ClaudeLogo,
  cursor: CursorLogo,
  copilot: CopilotLogo,
  codex: CodexLogo,
  gemini: GeminiLogo,
  windsurf: WindsurfLogo,
  trae: TraeLogo,
  opencode: OpenCodeLogo,
  kiro: KiroLogo,
  openclaw: OpenClawLogo,
  hermes: HermesLogo,
  workbuddy: WorkBuddyLogo,
  infcode: InfCodeLogo,
};

export function getPlatformLogo(platform: string): LogoComponent | undefined {
  if (platform.startsWith('custom:')) return undefined;
  return PLATFORM_LOGOS[platform];
}
