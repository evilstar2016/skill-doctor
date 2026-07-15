import type { PlatformAdapter } from '../types';
import { claudeAdapter } from './claude';
import { codexAdapter } from './codex';
import { copilotAdapter } from './copilot';
import { cursorAdapter } from './cursor';
import { geminiAdapter } from './gemini';
import { hermesAdapter } from './hermes';
import { kiroAdapter } from './kiro';
import { openclawAdapter } from './openclaw';
import { opencodeAdapter } from './opencode';
import { traeAdapter } from './trae';
import { windsurfAdapter } from './windsurf';

export const PLATFORM_ADAPTERS: PlatformAdapter[] = [
  claudeAdapter,
  cursorAdapter,
  copilotAdapter,
  codexAdapter,
  geminiAdapter,
  windsurfAdapter,
  traeAdapter,
  opencodeAdapter,
  kiroAdapter,
  openclawAdapter,
  hermesAdapter,
];
