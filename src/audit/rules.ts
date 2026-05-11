import type { RuleId } from '../types/audit';

export interface AuditRule {
  ruleId: RuleId;
  severity: 'high' | 'med' | 'low';
  label: string;
  patterns: RegExp[];
}

export const RULES: AuditRule[] = [
  {
    ruleId: 'shell-exec',
    severity: 'high',
    label: 'shell execution instruction',
    patterns: [
      /\bsh\s+-c\b/i,
      /\bbash\s+-c\b/i,
      /\beval\s*\(/i,
      /\bsubprocess\s*\.\s*(run|call|Popen)\b/i,
      /\bos\.system\s*\(/i,
      /\bexec\s*\(\s*['"`]/i,
      /\b(run|execute)\s+(the\s+)?(command|shell|script|bash)\b/i,
      /\byou\s+(should|must|will|can)\s+run\b/i,
    ],
  },
  {
    ruleId: 'destructive',
    severity: 'high',
    label: 'destructive operation',
    patterns: [
      /\brm\s+-rf\b/i,
      /\bdrop\s+table\b/i,
      /\btruncate\s+(table|database|collection)\b/i,
      /\bdelete\s+\*/i,
      /\bwipe\s+(the\s+)?(disk|drive|database|all|data)\b/i,
      /\bdestroy\s+(all|the)\b/i,
      /删除所有/,
      /清空(所有|数据库|文件)/,
      /格式化(磁盘|硬盘)/,
    ],
  },
  {
    ruleId: 'secret-leak',
    severity: 'med',
    label: 'potential credential exposure',
    patterns: [
      /(output|send|return|print|expose|include|attach|share|log|display|reveal|leak|pass|provide).{0,80}(api[_\-\s]?key|access[_\-\s]?key|private[_\-\s]?key|password|secret\b|credential|auth[_\-\s]?token)/i,
      /(api[_\-\s]?key|access[_\-\s]?key|private[_\-\s]?key|password|secret\b|credential|auth[_\-\s]?token).{0,80}(output|send|return|print|expose|include|attach|share|log|display|reveal|leak|pass|provide)/i,
    ],
  },
  {
    ruleId: 'network-call',
    severity: 'low',
    label: 'external network request',
    patterns: [
      /\bcurl\s+https?:\/\//i,
      /\bwget\s+https?:\/\//i,
      /\bPOST\s+to\s+https?:\/\//i,
      /\bfetch\s*\(\s*['"`]https?:\/\//i,
      /\bupload\s+(to\s+)?(the\s+)?(server|api|endpoint|cloud)\b/i,
      /\bsend\s+to\s+(an?\s+)?(external|remote|webhook|server|api|endpoint)\b/i,
      /\bwebhook\s+(url|endpoint|call|request)\b/i,
      /发送请求/,
      /调用(外部)?接口/,
      /上传到/,
    ],
  },
];
