import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docsRoot = join(repositoryRoot, 'docs');

const languages = [
  {
    code: 'en',
    htmlLang: 'en',
    indexPath: 'en/',
    manualPath: 'en/pages/manual.html',
    readme: 'README.md',
    indexTitle: 'skill-doctor — AI Agent Skills Audit Tool',
    indexDescription: 'Skill Doctor is a local-first CLI for auditing AI agent skills, rules, instructions, and MCP configuration across Claude Code, Codex, Copilot, Cursor, and WorkBuddy for duplicates, conflicts, security risks, and context cost.',
    manualTitle: 'skill-doctor manual v0.5.0',
    manualDescription: 'The skill-doctor manual explains how to install and run the CLI, inspect AI agent skills across Claude Code, Codex, Copilot, Cursor, and WorkBuddy, find conflicts, audit security risks, and measure context cost.',
  },
  {
    code: 'zh-CN',
    htmlLang: 'zh-CN',
    indexPath: 'zh-CN/',
    manualPath: 'zh-CN/pages/manual.html',
    readme: 'README.zh-CN.md',
    indexTitle: 'skill-doctor — AI Agent Skills 审计工具',
    indexDescription: 'Skill Doctor 是一个本地 CLI，用于审计 Claude Code、Codex、Copilot、Cursor、WorkBuddy 等 AI Agent 的 skills、rules、instructions 和 MCP 配置，发现重复、冲突、安全风险与上下文成本。',
    manualTitle: 'skill-doctor 使用手册 v0.5.0',
    manualDescription: 'skill-doctor 使用手册：安装并运行 CLI，检查 Claude Code、Codex、Copilot、Cursor、WorkBuddy 等 AI Agent skills 的重复、冲突、安全风险、上下文成本与 MCP 配置。',
  },
];

const siteRoot = 'https://evilstar2016.github.io/skill-doctor/';

function replaceMetaContent(html, attribute, content) {
  const pattern = new RegExp(`(<meta\\s+[^>]*${attribute}[^>]*content=")[^"]*(")`);
  return html.replace(pattern, `$1${content}$2`);
}

function selectLanguage(html, language) {
  const keep = language.code === 'en' ? 'en' : 'zh';
  const drop = keep === 'en' ? 'zh' : 'en';

  html = html.replace(new RegExp(`<p class="${drop}"[^>]*>[\\s\\S]*?<\\/p>`, 'g'), '');
  html = html.replace(new RegExp(`<p class="${keep}"([^>]*)>`, 'g'), '<p$1>');
  html = html.replace(new RegExp(`<span class="${drop}">[\\s\\S]*?<\\/span>`, 'g'), '');
  html = html.replace(new RegExp(`<span class="${keep}">([\\s\\S]*?)<\\/span>`, 'g'), '$1');
  html = html.replace(new RegExp(`\\sclass="${drop}"`, 'g'), '');
  html = html.replace(new RegExp(`\\sclass="${keep}"`, 'g'), '');
  html = html.replace(/ data-lang="(?:zh|en)"/g, '');
  html = html.replace(/\s*\/\* bilingual: hide [^*]+\*\/\s*body\[data-lang="en"\] \.zh\{display:none\}\s*body:not\(\[data-lang="en"\]\) \.en\{display:none\}\s*/g, '\n');

  return html;
}

function setActiveLanguageLink(html, language) {
  const zhActive = language.code === 'zh-CN' ? ' class="active"' : '';
  const enActive = language.code === 'en' ? ' class="active"' : '';
  html = html.replace(/(<a\s+[^>]*?href="https:\/\/evilstar2016\.github\.io\/skill-doctor\/zh-CN(?:\/|\/pages\/manual\.html)")[^>]*>/, `$1${zhActive}>`);
  html = html.replace(/(<a\s+[^>]*?href="https:\/\/evilstar2016\.github\.io\/skill-doctor\/en(?:\/|\/pages\/manual\.html)")[^>]*>/, `$1${enActive}>`);
  return html;
}

function localizeMetadata(html, language, page) {
  const canonical = `${siteRoot}${page === 'index' ? language.indexPath : language.manualPath}`;
  const title = page === 'index' ? language.indexTitle : language.manualTitle;
  const description = page === 'index' ? language.indexDescription : language.manualDescription;

  html = html.replace(/<html lang="[^"]+">/, `<html lang="${language.htmlLang}">`);
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
  html = html.replace(/<link rel="canonical" href="[^"]+">/, `<link rel="canonical" href="${canonical}">`);
  html = replaceMetaContent(html, 'name="description"', description);
  html = replaceMetaContent(html, 'property="og:title"', title);
  html = replaceMetaContent(html, 'property="og:description"', description);
  html = replaceMetaContent(html, 'property="og:url"', canonical);
  html = replaceMetaContent(html, 'name="twitter:title"', title);
  html = replaceMetaContent(html, 'name="twitter:description"', description);
  html = html.replace(/("description":\s*")[^"]*(")/, `$1${language.indexDescription}$2`);
  return setActiveLanguageLink(html, language);
}

function localizeIndexPaths(html, language) {
  html = html.replace(/src="\.\.\/assets\//g, 'src="../../assets/');
  html = html.replace(/src="\.\/pages\//g, 'src="../pages/');
  html = html.replace(/href="\.\/pages\/(scan-report\.sample\.html|dashboard\.sample\.html)"/g, 'href="../pages/$1"');
  html = html.replace(/href="\.\/README\.md"/g, `href="../${language.readme}"`);
  return html;
}

function localizeManualPaths(html) {
  return html.replace(/\.\.\/\.\.\/assets\//g, '../../../assets/');
}

function render(source, language, page) {
  let html = selectLanguage(source, language);
  html = page === 'index' ? localizeIndexPaths(html, language) : localizeManualPaths(html);
  return localizeMetadata(html, language, page);
}

async function writeLocalizedPage(source, language, page) {
  const relativePath = page === 'index' ? `${language.indexPath}index.html` : language.manualPath;
  const outputPath = join(docsRoot, relativePath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, render(source, language, page).replace(/[ \t]+$/gm, ''), 'utf8');
  console.log(`wrote docs/${relativePath}`);
}

const indexSource = await readFile(join(docsRoot, 'index.html'), 'utf8');
const manualSource = await readFile(join(docsRoot, 'pages/manual.html'), 'utf8');

for (const language of languages) {
  await writeLocalizedPage(indexSource, language, 'index');
  await writeLocalizedPage(manualSource, language, 'manual');
}
