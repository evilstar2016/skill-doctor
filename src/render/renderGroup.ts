import type { GroupResult } from '../types/explain';

export function renderGroup(result: GroupResult): string {
  const total = result.groups.reduce((sum, g) => sum + g.skills.length, 0) + result.ungrouped.length;
  const groupCount = result.groups.length + (result.ungrouped.length > 0 ? 1 : 0);
  const lines: string[] = [
    `Skill Groups — ${total} skill${total === 1 ? '' : 's'} across ${groupCount} group${groupCount === 1 ? '' : 's'}`,
    '',
  ];

  for (const group of result.groups) {
    lines.push(`── ${group.label} (${group.skills.length}) ──────────────────────────`);
    for (const skill of group.skills) {
      lines.push(`  ${skill.name.padEnd(30)} ${skill.platform} / ${skill.scope}`);
    }
    lines.push('');
  }

  if (result.ungrouped.length > 0) {
    lines.push(`── (other) (${result.ungrouped.length}) ──────────────────────────────`);
    for (const skill of result.ungrouped) {
      lines.push(`  ${skill.name.padEnd(30)} ${skill.platform} / ${skill.scope}`);
    }
  }

  return lines.join('\n');
}
