# GitHub Skill Landscape Notes

Last updated: 2026-05-11

## Why this file exists

This is a shortlist of external GitHub repositories worth tracking while planning the next phase of Skill Doctor.

## Shortlist

| Repository | Why it matters | Relevance to Skill Doctor |
| --- | --- | --- |
| `anthropics/skills` | Official public skill corpus and structure reference. | Useful for parser compatibility and safety-audit rule design. |
| `github/awesome-copilot` | Large ecosystem index for Copilot instructions, agents, and related assets. | Useful for path coverage and future platform expansion. |
| `affaan-m/everything-claude-code` | Large Claude Code rule/skill corpus with broad operational patterns. | Useful as a stress-test corpus for discovery and conflict detection. |
| `forrestchang/andrej-karpathy-skills` | Lightweight behavior-oriented skill pack. | Useful as a model for small, high-signal skill design. |
| `obra/superpowers` | Agentic workflow framework around reusable capabilities. | Useful for product positioning and future explanation/audit features. |
| `Code-and-Sorts/awesome-copilot-agents` | Curated list of instructions, prompts, skills, MCPs, and agent files. | Useful for future asset taxonomy beyond pure skills. |

## What to borrow next

### For v0.1 hardening

- Use larger public skill corpora as regression input for discovery and conflict detection.
- Check whether their directory and file naming patterns reveal unsupported local conventions.

### For v0.2 differentiation

- Study how public skill packs describe dangerous capabilities such as shell execution, file mutation, secrets, or network calls.
- Convert those patterns into a safety audit rulebook.
- Track how ecosystems mix `skills`, `instructions`, `agents`, and `rules` so Skill Doctor can later expand beyond the current asset scope.

## Suggested watch list

1. `anthropics/skills`
2. `github/awesome-copilot`
3. `affaan-m/everything-claude-code`
4. `forrestchang/andrej-karpathy-skills`