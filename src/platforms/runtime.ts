import type { SkillFile, SkillRecord } from '../types/skill';
import type {
  PlatformAdapter,
  PlatformInstructionCandidate,
  PlatformRuntimeContext,
} from './types';

export interface PlatformRuntime {
  adapter: PlatformAdapter;
  discoverAdditionalInstructions: () => PlatformInstructionCandidate[];
  postProcessInstructions: (files: SkillFile[]) => SkillFile[];
  postProcessSkills: (skills: SkillRecord[]) => SkillRecord[];
}

export function createPlatformRuntime(
  adapter: PlatformAdapter,
  context: PlatformRuntimeContext,
): PlatformRuntime {
  return {
    adapter,
    discoverAdditionalInstructions: () => adapter.discoverAdditionalInstructions?.(context) ?? [],
    postProcessInstructions: (files) => adapter.postProcessInstructions?.(files) ?? files,
    postProcessSkills: (skills) => adapter.postProcessSkills?.(skills) ?? skills,
  };
}
