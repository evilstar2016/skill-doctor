import zhCN from '../web/src/i18n/zh-CN.json';

export function zhMessage(key: keyof typeof zhCN, values: Record<string, string | number> = {}): string {
  return zhCN[key].replace(/{{(\w+)}}/g, (_, name: string) => String(values[name] ?? `{{${name}}}`));
}
