# 一段 prompt 搞定贡献（中文版）

把下面代码块整段复制，粘给 Claude Code、Cursor、Codex，或任何能执行 shell 命令的 agent。
它会先体检你本机的配置，再从三条轨道里挑一条，验证改动，然后提 PR。

不用先读文档。卡住了它会停下来告诉你卡在哪。

---

```text
你要给 skill-doctor 提交一个贡献。这是一个在本机运行的 CLI，用来体检 AI agent 的 skills、
rules、instruction 文件和 MCP 配置。仓库：github.com/evilstar2016/skill-doctor

目标：完成一个「小而可验证」的贡献，并以 pull request 的形式提交。
从下面三条轨道里只选一条——选第一条适用的。不要同时做两条。

动手之前：
- 在本项目里跑 `npx @evilstar2025/skill-doctor scan`，把输出读完。
- 再跑 `npx @evilstar2025/skill-doctor audit` 和 `npx @evilstar2025/skill-doctor conflicts`。
- 读 CONTRIBUTING.md、ADDING_PLATFORM.md、.github/PULL_REQUEST_TEMPLATE.md。
- 建分支：`git checkout -b contrib/<简短英文标识>`

轨道 A —— 报一个误报（最快，不写代码）
适用场景：scan / conflicts / audit 报了某个其实没问题的东西。
- 定位到具体命令，以及对应的 ruleId（shell-exec、destructive、secret-leak、network-call）
  或冲突原因。
- 脱敏：私有路径、内部 skill 正文、token、客户数据一律替换掉再贴。
- 用 .github/ISSUE_TEMPLATE/false_positive.yml 提 issue，填写
  Command / Finding / Expected behavior / skill-doctor 版本。
- 这条轨道不要提 PR，issue 本身就是交付物。

轨道 B —— 补一个缺失的平台适配器
严格按 ADDING_PLATFORM.md 走完全程。要点：
1. 在 `src/types/skill.ts` 的 `Platform` 里加小写平台 id。
2. 新建 `src/platforms/adapters/<agent>.ts`，导出一个 `PlatformAdapter`。
3. 在 `src/platforms/adapters/index.ts` 里注册。
4. 在 `tests/fixtures` 下加最小可用的 fixture。
5. 更新 ADDING_PLATFORM.md 第 5 步点名的那些测试。
约束：
- `installTargets` 只声明官方文档里写明的、可写的 `skill-dirs` 路径。
  仅发现（discovery-only）、`costOnly`、单文件、系统托管路径都不允许变成可部署目标。
- 不要在通用 discovery 或 config 模块里加 `platform === '<名字>'` 分支。
  需要特殊行为就加 adapter hook。
- 如果全局或项目路径没有厂商文档兜底，`confidence` 标 `'low'`，并在 PR 正文里说明。

轨道 C —— 加一条审计规则
1. 在 `src/types/audit.ts` 的 `RuleId` 里加一个成员。
2. 在 `src/audit/rules.ts` 的 `RULES` 里加一条：
   `{ ruleId, severity: 'high' | 'med' | 'low', label, patterns: RegExp[] }`
3. 在 `tests/audit/` 下补测试（扩展 `runAudit.test.ts` 或新建聚焦用例），
   至少覆盖一个真阳性，以及一个「看起来像但绝对不能命中」的近似样本。
4. pattern 要写窄。一条会命中普通说明文字的规则，比没有规则更糟。

硬性要求：
- 绝不上传、粘贴或提交私有 skill 内容、API key、token、客户数据。
- diff 保持最小。不许改格式、不许重构、不许顺手「优化」无关代码。
- 不要新增依赖；如果确实绕不过去，先问，别自己装。
- 不许把默认行为改成会上传、删除或修改仓库之外的东西。

提 PR 之前必须全部跑通：
  npm ci
  npm test
  npm run typecheck:ui
  npm run build
  npm run check:project
  git diff --check

然后提 PR，标题按类型选一个：
  feat(platform): <平台名>
  feat(audit): <规则 id>
  fix: <修了什么>
PR 正文必须写清：改了什么、为什么改、你跑了哪些命令验证，
以及一段脱敏后的「改动前后输出对比」。

任何一步卡住——厂商文档缺失、路径有歧义、有测试在你改动之前就已经是红的——
就停下来汇报卡点。不要猜，也不要为了让测试变绿而跳过测试。
```

---

## 三条轨道分别是什么

| 轨道 | 你得到什么 | 落到仓库的产物 | 要不要写代码 |
|---|---|---|---|
| A · 误报 | 一个可复现的 issue | `.github/ISSUE_TEMPLATE/false_positive.yml` | 不用 |
| B · 平台适配器 | 支持你的 agent 或编辑器 | `src/platforms/adapters/<agent>.ts` | 要 |
| C · 审计规则 | 一类危险指令被识别出来 | `src/types/audit.ts` + `src/audit/rules.ts` | 要 |

三条都是**真实存在的贡献路径**，不是编出来凑数的：`infcode` 适配器就是这么进来的，
现有四条规则也是这么加的。prompt 里点名的文件、测试、门禁命令，仓库里全都有。

## 安全

prompt 里明确要求「报之前先脱敏」「绝不上传 skill 内容」，但**推之前请自己看一眼 diff**。
skill-doctor 的设计前提是本地优先：这套流程里没有任何一步需要把你的 skill 发到外面。
