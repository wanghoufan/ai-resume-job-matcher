# AGENTS.md — AI 超级求职助手

> 本文件是项目总入口：公共规则、角色索引与文档路由。各角色长规则在 `docs/roles/`，当前计划/回归/审查/交接分别在 `docs/pm`、`docs/qa`、`docs/review`、`docs/handoff`。

## 一、项目档案

- 项目名称：AI 超级求职助手（2026-08-21 用户定案的对外统一名称，原「AI 简历岗位匹配助手」）
- 项目类型：网页端 AI 工具（Next.js App Router 多路由应用）
- 当前阶段：课程作业 / 原型；在线简历 2.0 已合并到 `main` 并部署至 Vercel Production，待完成已登录发布生命周期验收；会员与支付功能开发中（收银台 / webhook / `/pricing` 已合并 `main`，状态接口与额度预留仍在本地未提交）
- 主要目标：提供岗位匹配分析，以及可编辑、换主题、发布分享的 HTML 在线简历主页
- 主要用户：求职者
- 当前待办：验证已登录生成、编辑、发布、匿名访问与取消发布；验证会员订阅生命周期（webhook → 订阅状态 → 分析额度预留/退回）与存量/取消订阅用户降级表现（详见 `docs/qa/BUGS.md`）；正式产品仍需速率限制、隐私告知和认证配置复核（详见 `README.md`「当前状态」）

### 技术栈

- 前端：Next.js 15（App Router）+ React 19 + TypeScript
- 后端：Next.js Route Handlers（服务端代理转发模型，失败回退 `curl`）
- 数据库 / 存储：Supabase Auth / Postgres / Storage（私有 bucket）
- PDF 解析：浏览器端 `pdfjs-dist`
- 模型转发：仅允许白名单四家固定厂商地址（BYOK）
- 样式方案：全局 CSS + CSS Modules（`app/*.css`）
- 测试方案：尚未建立自动化测试（见「上线前待办」）
- 部署平台：Vercel（生产项目 `ai-resume-job-matcher`；`.vercel/` 仅为本地关联缓存）

### 常用命令

- 安装依赖：`npm install`
- 本地开发：`npm run dev` → http://localhost:3000
- 类型检查：`npx tsc --noEmit`
- Lint：项目暂未配置（可补 `eslint`）
- 测试：暂无
- 构建：`npm run build`
- 预览：`npm run start`（或部署 Vercel）

## 二、目录与约定

- `app/page.tsx`：单页 UI（上传、BYOK 表单、结果、历史）。
- `app/api/analyze/route.ts`：服务端代理，落库 `resumes`/`job_descriptions`/`analyses`，不保存用户密钥。
- `app/resume-sites/`：在线简历列表、创建和编辑器；`app/r/[slug]/` 为无需登录的公开页。
- `app/api/resume-sites/`：来源读取、AI 生成、草稿保存、发布与取消发布。
- `app/pricing/`：会员方案页（`/pricing`）；`app/api/payments/waffo/checkout` 发起订阅收银台，`app/api/webhooks/waffo` 接收并校验 webhook 签名。
- `app/api/membership/route.ts`：读取本人订阅状态与当期额度（仅本人，未登录 401）；分析额度预留逻辑见 `app/api/analyze/route.ts`。
- `lib/waffo/config.ts`：Waffo Pancake 测试环境套餐与店铺配置（仅测试环境，非生产计费）。
- `components/resume-sites/ResumeRenderer.tsx`：编辑预览和公开页共用的四主题渲染器。
- `lib/resume-sites/`：结构化内容校验、公开字段过滤、AI 生成适配。
- `lib/supabase/{client,server,proxy}.ts`：浏览器 / 服务端客户端与会话刷新。
- `proxy.ts` + `middleware.ts`：Supabase 会话刷新（middleware 重导出 proxy）。
- 需求与上线状态见 `README.md`；登录配置见 `SUPABASE_AUTH_SETUP.md`。
- 开发过程与踩坑见 `docs/handoff/开发复盘与经验总结-小白版V2.md`（含安全红线清单）；部署配置不在仓库内。
- 当前需求 / 验收标准见 `docs/pm/PLAN.md`。

## 三、安全红线（修改服务端 / 认证 / 存储前必读）

- 绝不把 `service_role` key 或用户 BYOK key 写入 `NEXT_PUBLIC_`、数据库、日志或 Cookie；BYOK key 只存在于单次请求内存。
- 模型转发只允许白名单四家固定地址，禁止恢复「用户自定义 URL」（SSRF 风险）。
- 所有业务表开 RLS；私有草稿按 `auth.uid() = user_id` 隔离，匿名用户只可读取 `resume_site_publications.is_active = true` 的过滤后公开快照。
- Storage bucket 必须 private，路径 `{user_id}/{resume_id}/original.pdf`。
- 服务端独立校验文件大小（≤10MB）与路径归属；删除简历须连带删 Storage 原文件。
- 服务端错误信息脱敏后返回，原始错误仅进服务端日志。

## 四、全局工作原则

1. 先理解现有实现，再修改代码。
2. 优先复用现有代码、组件、函数和数据结构。
3. 不擅自增加用户未要求的功能。
4. 不进行与当前任务无关的重构。
5. 尽量减少新增第三方依赖。
6. 修改完成后必须进行必要验证。
7. 不允许通过删除测试、绕过校验、隐藏错误来制造“通过”结果。
8. 代码和实际运行结果优先于过期文档。
9. 发现文档与代码冲突时，应明确记录并修正文档。
10. 密钥、Token、`.env*`、私密配置不得提交到 Git。
11. 临时脚本、实验副本、一次性分析、截图、中间产物统一放入 `scratch/`。
12. 不得把临时垃圾放入正式源码目录。
13. 禁止自行创建重复的项目管理类 Markdown；优先更新已有唯一权威文档。
14. 每个 Agent 只执行自己角色范围内的工作，除非用户明确授权跨角色处理。
15. 不确定时优先检查代码、运行结果和现有文档，不凭猜测下结论。

## 五、Agent 角色索引

### 1. 技术规划师（Planner）
角色规范：`docs/roles/planner.md`
- 理解需求 / 检查现有实现 / 分析影响范围
- 制定低风险实施方案、更新 `docs/pm/PLAN.md`
- 完成 PLAN 后检查并按需建立 / 补充 `docs/qa/QA_CHECKLIST.md` 核心回归基线
- 默认不直接修改业务代码

### 2. 开发实现工程师（Builder）
角色规范：`docs/roles/builder.md`
- 按需求 / 计划实现功能、修改源码、基础自测、运行必要检查、修复已确认 Bug

### 3. 代码审查工程师（Code Reviewer）
角色规范：`docs/roles/code-reviewer.md`
- 独立审查代码，查找逻辑 Bug、数据一致性、性能 / 安全 / 可维护性风险，输出审查结果
- 默认不直接修改业务代码

### 4. 质量测试工程师（QA / Test Agent）
角色规范：`docs/roles/qa.md`
- 实际运行和操作产品，正常 / 边界 / 异常 / 连续操作、完整生命周期与回归测试，记录 Bug
- 默认不直接修改业务代码

### 5. 产品体验审查员（Product Reviewer）
角色规范：`docs/roles/product-reviewer.md`
- 从产品 / UX / 真实用户角度审查功能完整性、易用性、效率、一致性，维护优化候选池
- 不负责传统代码审查

> 注：本模板索引为 5 个常驻角色；交接上下文（v1.0）另含 `【修复】`（复用 Builder）与 `【收尾】neat-freak` 两种模式，见第十二节。

## 六、项目文档唯一归属表

| 信息类型 | 唯一权威位置 |
|---|---|
| 项目公共规则 | `AGENTS.md` |
| Agent 工作规范 | `docs/roles/` |
| 当前实施计划 | `docs/pm/PLAN.md` |
| 长期核心回归测试 | `docs/qa/QA_CHECKLIST.md` |
| 当前 Bug | `docs/qa/BUGS.md` |
| 当前代码审查结果 | `docs/review/CODE_REVIEW.md` |
| 产品优化候选 | `docs/review/PRODUCT_BACKLOG.md` |
| 当前交接上下文 | `docs/handoff/开发复盘与经验总结-小白版V2.md` |
| 临时资料 | `scratch/` |

同一事实不要在多个位置重复维护。

## 七、Agent 启动规则

每个 Agent 开始工作前：
1. 先阅读根目录 `AGENTS.md`。
2. 确认当前被指定的角色。
3. 阅读该角色对应的 `docs/roles/*.md`。
4. 再读取当前任务真正需要的项目文档。
5. 阅读相关源码和测试。
6. 不要为了“了解项目”一次性读取所有无关文档。
7. 执行完成后，只更新自己职责范围内的权威文件。

## 八、角色与文档写权限建议

| 角色 | 源码 | PLAN | QA_CHECKLIST | BUGS | CODE_REVIEW | PRODUCT_BACKLOG |
|---|---:|---:|---:|---:|---:|---:|
| 技术规划师 | 默认否 | 是 | 建议 | 否 | 否 | 建议 |
| 开发实现工程师 | 是 | 可更新状态 | 否 | 可更新修复状态 | 否 | 否 |
| 代码审查工程师 | 否 | 否 | 建议 | 可记录 | 是 | 否 |
| 质量测试工程师 | 否 | 否 | 是 | 是 | 否 | 否 |
| 产品体验审查员 | 否 | 否 | 否 | 否 | 否 | 是 |

用户明确授权时例外。

## 九、临时文件规范

以下内容统一放入 `scratch/`（默认不进 Git）：调试脚本、实验性代码、临时数据、一次性分析、中间报告、截图、临时导出、试验副本。不得把临时垃圾放入正式源码目录。

## 十、文档管理规则

禁止随意新增类似 `FINAL_REPORT.md`、`QA_FINAL.md`、`TEST_SUMMARY_NEW.md`、`REVIEW_LATEST.md` 等。已有对应权威文件应直接更新；只有现有文档体系无法承载必要信息时，才允许新增文档并说明原因。

## 十一、Git 与安全规则

1. 新项目尽早 `git init`；基线约定完成后先提交一次；阶段性 `commit` / `push`。
2. `scratch/`、构建缓存、依赖目录、密钥配置不得提交。
3. `.env*` 默认忽略；如需示例配置，只提交脱敏的 `.env.example`。
4. 不执行远程推送、删除分支、重写历史等高影响操作，除非用户明确授权。

## 十二、neat-freak 使用约定

`neat-freak`（`【收尾】`）不用于每次小改动后的例行清理，建议在以下节点执行完整收尾：较大开发阶段完成、MVP / 版本发布前、长会话准备交接、项目最终交付、文档明显与代码失配时。

收尾重点：代码事实与文档是否一致；`AGENTS.md` / `PLAN.md` 是否过期；已解决 Bug 是否仍残留在 `BUGS.md`；`QA_CHECKLIST.md` 是否需补充长期回归；`PRODUCT_BACKLOG.md` 是否混有已完成事项；`docs/handoff/开发复盘与经验总结-小白版V2.md` 是否可让新 Agent 直接接手；`scratch/` 是否仍有应保留 / 删除内容；是否存在重复、过时、冲突的 Markdown。

普通 commit、小 Bug、小样式改动无需执行完整 neat-freak。
