import type { ReactNode } from 'react';
import {
  AlertTriangle, ArrowRight, BarChart3, Check, CircleHelp, Filter, GitCompareArrows, LoaderCircle,
  Search, ShieldCheck, Stethoscope, X,
} from 'lucide-react';
import type { UiIssue, UiResource } from '../../../src/application/types';
import type { Scope } from '../../../src/types/skill';

export function PageHeading({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) { return <div className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div>{children && <div className="heading-action">{children}</div>}</div>; }
export function StatCard({ label, value, detail }: { label: string; value: string | number; detail: string }) { return <div className="stat-card"><span>{label}</span><strong>{Number(value).toLocaleString()}</strong><small>{detail}</small></div>; }
export function IssueCard({ issue, open }: { issue: UiIssue; open: () => void }) { const Icon = issue.kind === 'security' ? ShieldCheck : issue.kind === 'context' ? BarChart3 : GitCompareArrows; return <button className="issue-card" onClick={open}><span className={`issue-icon ${issue.severity}`}><Icon size={20} /></span><span className="issue-copy"><strong>{issue.title}</strong><small>{issue.summary}</small><span>{issue.resourceNames.join(' ↔ ')}</span></span><SeverityBadge severity={issue.severity} /><ArrowRight size={17} /></button>; }
export function SeverityBadge({ severity }: { severity: UiIssue['severity'] }) { return <span className={`severity ${severity}`}>{severityLabel(severity)}</span>; }
export function StatusPill({ kind, children }: { kind: 'success' | 'warning' | 'danger'; children: ReactNode }) { return <span className={`status-pill ${kind}`}>{kind === 'success' ? <Check size={14} /> : <AlertTriangle size={14} />}{children}</span>; }
export function ResourceStatus({ status, count }: { status: UiResource['status']; count: number }) { return <span className={`resource-status ${status}`}>{status === 'attention' ? `${count} 项需处理` : status === 'disabled' ? '已禁用' : status === 'unknown' ? '未知' : '正常'}</span>; }
export function FilterBar({ query, setQuery, placeholder, children }: { query: string; setQuery: (value: string) => void; placeholder: string; children: ReactNode }) { return <div className="filter-bar"><label className="search-input"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholder} /></label><div className="filter-selects"><Filter size={15} />{children}</div></div>; }
export function InlineNotice({ kind, title, children, onClose }: { kind: 'danger' | 'warning'; title: string; children: ReactNode; onClose?: () => void }) { return <div className={`inline-notice ${kind}`}><AlertTriangle size={17} /><div><strong>{title}</strong><span>{children}</span></div>{onClose && <button onClick={onClose}><X size={15} /></button>}</div>; }
export function SettingSwitch({ label, description, checked, disabled, onChange }: { label: string; description: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) { return <label className={`setting-switch ${disabled ? 'disabled' : ''}`}><div><strong>{label}</strong><span>{description}</span></div><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span className="switch-track" /></label>; }
export function HelpTip({ label, text }: { label: string; text: string }) { return <details className="help-tip"><summary aria-label={`解释${label}`}><CircleHelp size={14} /></summary><p>{text}</p></details>; }
export function Detail({ label, value }: { label: string; value: string }) { return <div className="detail"><span>{label}</span><strong>{value}</strong></div>; }
export function EmptyRows({ icon: Icon, title }: { icon: typeof Check; title: string }) { return <div className="empty-rows"><Icon size={22} /><span>{title}</span></div>; }
export function LoadingLine() { return <div className="loading-line"><LoaderCircle size={16} className="spin" />正在读取详情</div>; }
export function LaunchScreen() { return <div className="launch-screen"><span><Stethoscope size={30} /></span><h1>Skill Doctor</h1><p>正在启动本地配置体检台…</p><LoaderCircle className="spin" /></div>; }
export function ScanningEmpty({ running }: { running: boolean }) { return <div className="scanning-empty"><span>{running ? <LoaderCircle className="spin" /> : <CircleHelp />}</span><h2>{running ? '正在检查 Agent 配置' : '尚未生成体检结果'}</h2><p>{running ? '正在发现资源、分析冲突、安全风险和上下文成本。' : '点击重新体检开始。'}</p></div>; }
export function PlatformIcon({ platform }: { platform: string }) { return <span className="platform-icon">{platform.slice(0, 1).toUpperCase()}</span>; }

export function severityLabel(value: UiIssue['severity']): string { return ({ high: '高风险', med: '中风险', low: '低风险', info: '提示' } as const)[value]; }
export function kindLabel(value: UiIssue['kind']): string { return ({ security: '安全', conflict: '冲突', duplicate: '重复', context: '上下文' } as const)[value]; }
export function scopeLabel(value: Scope): string { return value === 'project' ? '项目' : '全局'; }
export function platformLabel(value: string): string { return ({ claude: 'Claude', cursor: 'Cursor', copilot: 'Copilot', codex: 'Codex', gemini: 'Gemini', windsurf: 'Windsurf', opencode: 'OpenCode', openclaw: 'OpenClaw' } as Record<string, string>)[value] ?? value; }
export function resourceKindLabel(value: string): string { return ({ skill: 'Skill', instruction: 'Instruction', rule: 'Rule', prompt: 'Prompt', agents: 'AGENTS.md', mcp: 'MCP', plugin: 'Plugin', memory: 'Memory' } as Record<string, string>)[value] ?? value; }
export function activationLabel(value?: string): string { return ({ startup: '启动加载', 'always-on': '每轮固定', 'on-demand': '按需激活', 'file-scoped': '文件范围', manual: '手动' } as Record<string, string>)[value ?? ''] ?? '未知'; }
export function shortPath(path: string): string { if (!path) return ''; const home = path.match(/^\/Users\/[^/]+|^\/home\/[^/]+/)?.[0]; return home ? path.replace(home, '~') : path; }
export async function copyText(text: string, setToast: (message: string) => void) { await navigator.clipboard.writeText(text); setToast('已复制'); }
