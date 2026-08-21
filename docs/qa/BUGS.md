# BUGS — 当前 Bug 清单

> 由 `QA`（主要）与 `Code Reviewer` 记录；`Builder` 修复后标记 `VERIFY`，**未经独立 QA 回归不得标记 `CLOSED`**。优先处理 P0 / P1 与产品体验 P1；P2 / P3 / Future 默认不自动开发。

## 记录格式

| 编号 | 严重度 | 状态 | 来源 | 描述 | 复现 | 修复 |
|---|---|---|---|---|---|---|
| BUG-001 | P1 | OPEN | QA | ... | ... | ... |

- 严重度：P0（阻断）/ P1（高）/ P2（中）/ P3（低）
- 状态：OPEN / VERIFY / CLOSED
- 来源：Code Review / QA / Product

## 当前记录

| 编号 | 严重度 | 状态 | 来源 | 描述 | 复现 | 修复 |
|---|---|---|---|---|---|---|
| BUG-001 | P1 | VERIFY | Code Review | 取消/逾期订阅用户完全失去免费额度：`reserve_analysis_quota` 仅认 `active/trialing`，webhook 取消后 plan_code 仍为 pro_*，分析接口返回 503 且文案误导（详见 CODE_REVIEW CR-001） | 已付费 → 触发取消 webhook → 调用 `/api/analyze` | 迁移 `20260821160200_quota_free_fallback.sql`（已推送远程）：reserve 查不到有效 active/trialing 订阅时回落 free 套餐额度，新增 `ensure_free_subscription()` 为缺行用户补建 free 订阅；待 QA 回归 |
| BUG-002 | P1 | VERIFY | Code Review | 存量用户（早于 schema 迁移注册）无 subscriptions 行：`/api/membership` 返回 500、`/api/analyze` 永久 503；membership 应改 `maybeSingle()` 并按 free 兜底（详见 CODE_REVIEW CR-002） | 以无 subscription 行的账号访问 `/pricing` 或发起分析 | `/api/membership` 改 `maybeSingle()` 并按 free/active 默认值兜底；analyze 侧由同一迁移的 free 回落 + 补建订阅覆盖；待 QA 以无订阅行账号实测 |
| BUG-003 | P2 | OPEN | Code Review | 额度按自然月重置与订阅周期不对齐，月中付款可获近双倍额度；年度会员额度展示口径易误解（详见 CODE_REVIEW CR-003） | 月中完成付款后跨自然月观察 usage_periods | 部分缓解：`/pricing` 额度标签已明示「每自然月重置」；周期口径统一（按订阅周年月 or 其他）留待正式计费前定案 |
| BUG-004 | P2 | VERIFY | Code Review | 无代码路径将订阅置为 `expired`，状态为死枚举（详见 CODE_REVIEW CR-004） | 审阅 webhook 状态映射 | 已查明 `@waffo/pancake-ts` WebhookEventType 无过期类事件（仅 activated/payment_succeeded/canceling/uncanceled/updated/canceled/past_due），`expired` 为预留枚举值、当前无生产者；口径在此注明，请 Reviewer/QA 确认后关闭 |
| BUG-005 | P3 | OPEN | Code Review | serverless 执行中断时已扣额度不回退且无对账（详见 CODE_REVIEW CR-005） | 分析中途断开连接后核对 usage_periods | — |
| BUG-006 | P3 | OPEN | Code Review | checkout=success 参数残留导致刷新重复轮询；组件卸载后轮询未中止（详见 CODE_REVIEW CR-006） | 支付成功回跳后刷新 `/pricing` | — |
