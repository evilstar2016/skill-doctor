/**
 * Opt-in debug logging for LLM / embedding round-trips.
 *
 * Enable with `SKILL_DOCTOR_LLM_DEBUG=1` (or `=true`) to stream request and
 * response details to stderr. Off by default so production output stays clean.
 *
 * Shared by every backend call site (explain, ai-scanner, conflict analysis,
 * embedding provider) so the toggle covers the whole pipeline from one switch.
 */
export const LLM_DEBUG =
  process.env.SKILL_DOCTOR_LLM_DEBUG === '1' ||
  process.env.SKILL_DOCTOR_LLM_DEBUG === 'true';

export function debugLlm(label: string, detail: string): void {
  if (!LLM_DEBUG) {
    return;
  }
  process.stderr.write(`[skill-doctor:llm] ${label}\n${detail}\n`);
}
