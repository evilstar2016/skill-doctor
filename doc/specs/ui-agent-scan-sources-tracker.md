# UI 按 Agent 配置扫描路径开发跟踪

目标：新增“扫描路径”配置页面，允许用户按 Agent 管理 Skill、MCP、Plugin 扫描来源；默认展示系统内置与用户已配置路径，并让 UI、CLI、Agent 探测使用相同的有效配置。

更新规则：每完成并验证一项功能，立即将对应 checkbox 改为 `[x]`，并在“验证记录”补充证据。

## A. 有效扫描来源模型与持久化

- [x] 定义按 Agent 分组的 Skill、MCP、Plugin 扫描来源类型。
- [x] 从平台注册表和 Codex 上下文配置生成内置默认来源。
- [x] 在 `~/.skill-doctor/config.json` 中读取、校验并规范化 `scanSources` 用户覆盖。
- [x] 按稳定 `id` 合并内置来源和用户覆盖，保留 `builtin / user / override` 来源信息。
- [x] 支持新增、编辑、启用/禁用、删除用户来源和恢复默认。
- [x] 保留现有 `paths.extra` 行为，避免旧配置失效。
- [x] 使用原子写入保存配置，且保留 embedding、analysis、ignore 等其他配置段。

## B. 扫描链路接入

- [x] Skill 扫描使用有效 Skill 来源。
- [x] MCP 扫描使用有效 MCP 配置文件来源。
- [x] Codex Plugin 扫描使用有效 Plugin 来源。
- [x] Agent 自动探测使用有效来源。
- [x] UI 与 CLI 扫描读取相同配置。
- [x] 自定义路径中的共享物理资源继续正确合并，不产生重复资源。

## C. 配置 API 与安全校验

- [x] `GET /api/scan-sources` 返回按 Agent 分组的有效配置和路径状态。
- [x] `PUT /api/scan-sources` 校验并保存用户配置。
- [x] `POST /api/scan-sources/validate` 支持保存前校验。
- [x] `POST /api/scan-sources/reset` 支持按 Agent 恢复默认。
- [x] 返回原始路径、解析后路径、范围、类型、来源和存在性状态。
- [x] 拒绝无效 Agent、资源类型、scope、MCP format 和空路径。

## D. 扫描路径页面

- [x] 侧边栏新增“扫描路径”一级入口和独立路由。
- [x] 按 Agent 切换并分组展示 Skill、MCP、Plugin 来源。
- [x] 默认来源即使路径不存在也保持展示，并标记状态。
- [x] 支持添加、编辑、启用/禁用和删除用户来源。
- [x] 内置来源不可删除，修改后显示为用户覆盖。
- [x] 支持按 Agent 恢复默认。
- [x] 提供“保存”和“保存并重新体检”两个明确动作。
- [x] 保存失败、校验错误和成功状态有清晰反馈。
- [x] 窄屏下路径列表保持可操作。

## E. 测试与交付

- [x] 单元测试覆盖配置规范化、合并、路径解析和原子保存。
- [x] 扫描测试覆盖自定义 Skill、MCP 和 Codex Plugin 来源。
- [x] 服务端测试覆盖查询、保存、校验、恢复默认和非法输入。
- [x] UI 测试覆盖默认展示、Agent 切换、增删改、保存和恢复默认。
- [x] `npm run typecheck:ui` 通过。
- [x] `npm test` 通过。
- [x] `npm run build` 通过。
- [x] 使用真实浏览器完成桌面端主流程验收。
- [x] 使用窄屏完成配置页面验收。

## 验证记录

- 2026-07-12：建立开发跟踪清单，开始开发。
- 2026-07-12：完成有效扫描来源模型、默认值合并、用户覆盖规范化和原子保存；配置单元测试 4 项通过。
- 2026-07-12：Skill、MCP、Codex Plugin 接入统一有效配置；集成测试证明同一用户配置中的三类自定义来源均进入体检资源。
- 2026-07-12：完成配置 API 与 Agent 探测接入；HTTP 集成测试 3 项通过，覆盖默认查询、非法配置、保存、重新探测和恢复默认。
- 2026-07-12：完成“扫描路径”一级页面和响应式布局；UI 测试覆盖默认路径、缺失状态、添加、保存与恢复默认。
- 2026-07-12：全量 `npm test` 通过（53 个测试文件、443 项测试），UI typecheck 和生产构建通过。
- 2026-07-12：Playwright 桌面初验发现状态区排列过密，已改为按 Skill/MCP/Plugin 使用独立列模板并重新构建；受当前会话用量上限影响，修正后桌面复验和窄屏验收交由自动化新会话继续。
- 2026-07-12：最终 CSS 调整后的定向验证通过（`tests/ui/App.test.tsx`、`tests/config/scanSources.test.ts`、`tests/application/scanSourcesIntegration.test.ts`，3 个文件共 8 项测试），`npm run typecheck:ui` 通过。
- 2026-07-12：全量回归再次通过（53 个测试文件、443 项测试），`npm run typecheck:ui`、`npm run build` 和 `git diff --check` 均通过。
- 2026-07-12：使用 `/tmp/skill-doctor-acceptance-home` 作为隔离 HOME 启动构建版 UI，确保验收不会写入真实 `~/.skill-doctor/config.json`；本次自动化环境未暴露浏览器控制接口，修正后桌面、390×844、交互与控制台复验仍保持未完成。
- 2026-07-12：使用真实 Chromium 完成桌面端复验；Claude 与 Codex Agent 切换正常，Codex 的 Skill、MCP、Plugin 三组及内置存在/缺失状态完整展示，状态、来源、启用开关和只读标签无重叠；新增并删除 Plugin 草稿成功，全程未保存。
- 2026-07-12：390×844 初验发现移动端顶部操作区被裁切，且资源类型网格选择器优先级导致页面横向溢出；已将顶部目标与操作区调整为两行布局，并为 Skill/MCP/Plugin 补强移动端两列网格规则。
- 2026-07-12：真实 Chromium 复验 390×844 通过；路径列表、存在/缺失与来源信息、启用/只读状态、Plugin 组、粘性恢复/保存动作和六项底部导航均完整可操作，无页面级横向溢出或关键控件裁切。桌面与窄屏控制台均为 0 error / 0 warning。
- 2026-07-12：验收服务始终使用隔离 HOME `/tmp/skill-doctor-acceptance-home`；验收结束时临时 `config.json` 仍不存在，真实用户配置未被修改。最终全量回归通过（53 个测试文件、443 项测试），`npm run typecheck:ui`、`npm run build` 和 `git diff --check` 均通过。
