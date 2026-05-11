import { STOPWORDS } from './stopwords';

export function tokenize(text: string): Set<string> {
  if (!text.trim()) {
    return new Set();
  }

  const normalized = text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();

  const tokens = normalized.match(/[\p{L}\p{N}]+/gu) ?? [];
  const result = new Set<string>();

  for (const rawToken of tokens) {
    const token = normalizeToken(rawToken);

    if (token.length <= 2 || STOPWORDS.has(token)) {
      continue;
    }

    result.add(token);
  }

  return result;
}

function normalizeToken(token: string): string {
  if (token.endsWith('ies') && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith('es') && token.length > 4) {
    return token.slice(0, -2);
  }

  if (token.endsWith('s') && token.length > 4) {
    return token.slice(0, -1);
  }

  return token;
}