# CODE_REVIEW — 代码审查结果

> 由 `Code Reviewer` 独立产出，默认不直接修改业务代码；结论供 `Builder`（`【修复】`）消费。`Code Reviewer` 与 `QA`、`Product Reviewer` 职责分离。

## 记录格式

### 审查记录 YYYY-MM-DD
- 范围：<改动 / PR / 文件>
- 结论：通过 / 需修改
- 问题（按严重度）：
  - [P0] ...
  - [P1] ...
- 建议：...

## 当前记录

### 审查记录 2026-08-21 — 会员与支付生命周期（额度预留 / membership API / pricing 状态页）

- 范围：工作区未提交改动
  - 新增 `supabase/migrations/20260821145227_complete_membership_lifecycle.sql`
  - 新增 `app/api/membership/route.ts`
  - 修改 `app/api/analyze/route.ts`、`app/pricing/PricingClient.tsx`、`app/pricing/pricing.css`
  - 文档同步 `docs/pm/PLAN.md`（2.3 会员与支付、路由表）
- 结论：**需修改**（无 P0；2 项 P1 生命周期/一致性问题建议修复后再进入已登录验收）

#### 验证通过项

1. 安全红线合规：
   - BYOK key 未落库 / 不进日志 / 不进响应；服务端错误只打 error code，未泄露原始信息。
   - 模型转发白名单未变动；无用户自定义 URL 回潮。
   - `/api/membership` 仅返回本人数据（RLS + `eq user_id`），带 `Cache-Control: private, no-store`。
   - `reserve_analysis_quota` 为 `security invoker` 且 revoke anon / grant authenticated 配套齐全；相关 RLS（subscriptions 只读本人、plans 需 is_active、usage_periods 本人读写、usage_events 本人可插入）在既有迁移中均已存在。
   - `release_analysis_quota` 带 `user_id = auth.uid()` 归属校验，无法越权释放他人额度。
   - `process_waffo_subscription_event` 保持仅 service_role 可执行。
2. 并发与原子性：reserve 使用 `INSERT … ON CONFLICT (user_id, period_start) DO UPDATE` + `SELECT … FOR UPDATE`，同月并发请求在唯一约束上串行化，不会超扣；`unique(user_id, period_start)` 与索引存在。
3. analyze 主流程顺序正确：所有输入校验之后才扣额度；`finally` 中按 `completed` 标志精确退回；`allowed=false` 提前 429 不误触发释放；`remaining = limit − used_old − 1` 计算正确。新迁移相比旧版补上了 `current_period_end > now()` 过滤，修复了过期订阅仍可分析的问题。
4. 类型检查 `npx tsc --noEmit` 通过。

#### 问题清单

- [P1] CR-001 取消/逾期订阅用户完全失去免费额度，且报错误导
  - `reserve_analysis_quota` 要求 `status in ('active','trialing')`；webhook 将取消事件置为 `canceled`（plan_code 仍是 pro_*），past_due 同理。此类用户调用 `/api/analyze` 直接抛异常 → 503「暂时无法确认会员额度」，连 free 套餐的每月额度也不可用——比从未付费的免费用户（free/active，可用 5 次/月）处境更差。且 503 文案暗示临时故障，实际是终态。缺一条「订阅失效后回落 free」的生命周期规则（SQL 或 webhook 处理层二选一）。
- [P1] CR-002 迁移前注册的存量用户无 subscriptions 行，导致 500/503
  - `on_auth_user_created` 触发器只对新注册用户生效。若存在早于 schema 迁移的 auth.users 用户，其无 subscription 行：`/api/membership` 用 `.single()` 查询得到 PGRST116 → 返回 500；`/api/analyze` reserve 抛 'No active subscription found' → 503，永久不可用。membership 应改 `maybeSingle()` 并按 free 默认值兜底；analyze 侧同样需要明确策略。
- [P2] CR-003 额度周期按自然月、订阅周期按付款日，两者不对齐
  - usage_periods 以 `date_trunc('month')` 自然月重置，而订阅有效期由 webhook 的 period_start/end 决定。月中付款的月度会员可在同一订阅期内获得接近双倍额度；年度会员 UI 显示「本期分析额度 5/5」+「有效期至（一年后）」，实际每自然月重置 5 次，易误解。测试环境可接受，正式计费前需统一口径（按订阅周年月 or 明示「每自然月」）。
- [P2] CR-004 无任何代码路径将订阅置为 `expired`
  - 枚举与前端 statusLabels 都含 `expired`，但 `subscriptionStatus()` 只映射 canceled/past_due/active。若依赖外部过程处理需在文档注明，否则该状态为死代码，易误导排查。
- [P3] CR-005 serverless 执行中断时已扣额度泄漏
  - 客户端断连或进程被杀时 `finally` 不执行，reserved 额度不回退，且无对账任务。原型阶段可接受，上线前建议加幂等对账（如以 analyses 终态为准的重算任务）。
- [P3] CR-006 checkout=success 参数残留导致刷新重复轮询
  - 成功回跳 URL 不清理 query，刷新页面会再触发一轮最长 30s 轮询；组件卸载后轮询循环仍在 setState。建议成功后 `history.replaceState` 清参并在 effect 中处理卸载。
- [P3] CR-007 启动时重复请求 membership
  - `getSession().then` 与 `onAuthStateChange` 的 INITIAL_SESSION 各触发一次 `loadMembership`，启动期重复请求。低影响，可去重。
- [P3] CR-008 免费用户额度展示口径
  - 免费用户 quota 显示 plan.analysis_limit（5）而非 usage_periods 快照值；若管理员调整 plans 数值，历史 usage_period 行会在下次 reserve 时被覆盖更新，行为一致但值得知晓（非缺陷，记录口径）。

#### 建议

1. 优先处理 CR-001 / CR-002（均为生命周期完整性问题，直接阻塞「已登录发布生命周期验收」中的分析链路回归）。
2. CR-003 在转正式计费前必须定案；当前测试环境可在 PLAN 或 UI 文案中先明示「每自然月重置」。
3. QA_CHECKLIST 建议补充两条长期用例：①取消订阅后用户回落 free 额度的行为断言；②存量无订阅用户的降级表现。（已属 QA 文档职责，此处仅建议）

> 关联 Bug 已同步登记至 `docs/qa/BUGS.md`（BUG-001 ~ BUG-002 对应 CR-001 / CR-002）。
