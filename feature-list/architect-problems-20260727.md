> from: claude-sonnet-5
基于对 `src/` 全量结构、`ROADMAP.md`、`analysis/`、`doc/` 及最近提交历史的实际检索，以下是当前架构可优化的关键点，按影响/紧迫度排序：

## 1. Center.json 迁移遗留了三套并行的持久化代码（最值得清理）

项目正在从 `catalog.json` + `deployments.json` + `registry.json`（三个文件）迁移到统一的 `center.json`（见 `src/library/centerStore.ts` 里的 `migrateToCenter`）。但迁移不彻底，导致：

- **完全死代码**：`src/library/catalog.ts::saveManagedSkillCatalog`、`src/library/deployments.ts::loadSkillDeploymentStore`/`saveSkillDeploymentStore` 在全仓库（含测试）中除自身定义外零调用点。
- **`src/install/registry.ts`** 整个模块（`addRegistryEntry`/`removeRegistryEntry`/`findRegistryEntry`/`saveRegistry`）只被自己的测试和 `centerStore.ts` 里一次性的 `adoptLegacyRegistry`（迁移兼容）引用——应用代码从未主动调用它们，说明这是被 `centerStore.ts` 里等价的 `upsertRegistryInstall`/`findRegistryInstall`/`removeRegistryInstall` 取代后忘记删除的旧实现。
- **`centerStore.ts` 身兼三职**：规范 CRUD store + 一次性旧格式迁移 + 给 `installSkill.ts`/`uninstallSkill.ts` 用的 `RegistryEntry` 形状兼容垫片（`loadCenterRegistry`/`upsertRegistryInstall`）。等 `install/uninstall` 直接改用 `CenterSkill` 后，这层垫片和兼容代码可以整体去掉。

同时三处（`catalog.ts`、`centerStore.ts`、`deployments.ts`）各自写了一份几乎相同的"临时文件+rename"原子写 JSON 逻辑，可以提取成一个共享 helper。

## 2. CLI 与 UI 走两套并行的 install/uninstall 逻辑

`ROADMAP.md` 第 6 条已经明确点出这个债务："Replace the separate simple-install and managed-deployment paths with one shared InstallTarget model"。实际代码验证：`src/cli/index.ts:712-862`（~150 行内联的 target 解析/flag 处理）和 `src/application/install.ts` 各自包一层再调用同一个底层 `installSkill`/`uninstallSkill`，逻辑重复但未共享。这是维护者自己已知且写进 roadmap 的问题，可以作为下一步实施项。

## 3. `src/cli/index.ts`（1537 行）是唯一未模块化的层

架构文档强调"能力层各模块无框架依赖、职责单一"，但命令分发本身是一个巨大的 if-chain，混杂了 flag 解析、payload 构建、排序过滤、渲染调用。对比其他目录（`application/`、`library/`）都按职责拆成小文件，`cli/index.ts` 是明显的异类，且 `vitest.config.ts` 里覆盖率阈值特意排除了它——最大最复杂的文件反而没有强制测试覆盖保证。可以按子命令拆分到 `src/cli/commands/*.ts`。

## 4. Context 模块中 Codex 专属逻辑绕过了平台适配抽象

架构设计原则声明"12 个平台的路径/别名统一收敛到 `PlatformAdapter`"，但 `src/context/scanCodexContext.ts`(674 行) + `codexContextConfig.ts`(317) + `codexControls.ts`(269) 加起来近 2000 行全是 Codex 专属的 plugin/session 状态处理，游离在 `src/platforms/adapters/` 之外、却嵌在通用命名的 `context` 域里。这打破了"新平台只需在 adapters/ 里加一个文件"的可扩展性承诺——如果之后要支持另一个同样复杂的平台，`context/` 目录会继续膨胀成平台特判的大杂烩。

## 5. Web 端组件粒度过粗

`web/src/App.tsx`(667 行) 内联了 `Drawer`、`Topbar`、`Sidebar`、`SettingsDrawer`、`IssueDrawer`、`ResourceDrawer`、`ModelServiceSettings`、`OnboardingDialog`、`CompareDialog` 等近十个组件；`ManagePage.tsx`(578 行) 类似。`web/src/components/` 目录已经存在，是现成的拆分目标，目前只放了 `ui.tsx`/`ThemeToggle.tsx`/`EmptyState.tsx` 这几个小组件。

---

**建议优先级**：1（清理死代码+统一持久化）风险最低、收益明确，适合先做；2（install 收敛）工作量较大但 roadmap 已认可方向；3、4、5 属于结构性重构，建议按需驱动（比如下次要加新平台或新命令时顺手做）。

你想先深入哪一项？我可以先从 1 开始（删除死代码、去重原子写逻辑、确认迁移垫片能否退役），风险最小且立即可验证。