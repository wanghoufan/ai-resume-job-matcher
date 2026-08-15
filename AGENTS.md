# AGENTS.md — AI 简历岗位匹配助手

## 定位
面向求职者的 AI 简历—岗位匹配工具：上传 PDF 简历 + 粘贴 JD，由用户自带密钥（BYOK）调用大模型，输出匹配度、优化建议、求职信、10 道面试题与六维能力雷达图。账号、历史与简历存储在 Supabase。

## 怎么跑起来
```bash
npm install
cp .env.example .env.local   # 填入 NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY
npm run dev                  # http://localhost:3000
```
类型检查：`npx tsc --noEmit`；生产构建：`npm run build`。

## 技术栈
Next.js 15（App Router）+ React 19 + TypeScript；Supabase Auth / Postgres / Storage；浏览器端 `pdfjs-dist` 解析 PDF；服务端用 Node `fetch` 转发模型（失败回退 `curl`），仅允许四家固定厂商白名单。

## 目录与约定
- `app/page.tsx`：单页 UI（上传、BYOK 表单、结果、历史）。
- `app/api/analyze/route.ts`：服务端代理，落库 `resumes`/`job_descriptions`/`analyses`，不保存用户密钥。
- `lib/supabase/{client,server,proxy}.ts`：浏览器/服务端客户端与会话刷新。
- `proxy.ts` + `middleware.ts`：Supabase 会话刷新（middleware 重导出 proxy）。
- 需求与上线状态见 `README.md`；Supabase/Google 登录配置见 `SUPABASE_AUTH_SETUP.md`。
- 开发过程与踩坑见 `开发复盘与经验总结.md`（含安全红线清单），部署配置不在仓库内。

## 当前状态与下一步
课程作业/原型，已可本地跑通：PDF 解析、四家 BYOK、邮箱/Google 登录入口、私有存储、最近 30 条历史。
部署目标：Vercel（已移除 netlify.toml 示例配置；`.vercel/` 为本地缓存）。
上线前待办（见 README「当前状态」）：Supabase RLS 与 Storage 策略复核、Google OAuth 实际配置、速率限制、隐私告知。

## 安全红线（修改服务端/认证/存储前必读）
- 绝不把 `service_role` key 或用户 BYOK key 写入 `NEXT_PUBLIC_`、数据库、日志或 Cookie；BYOK key 只存在于单次请求内存。
- 模型转发只允许白名单四家固定地址，禁止恢复「用户自定义 URL」（SSRF 风险）。
- 所有业务表开 RLS，规则 `auth.uid() = user_id`；Storage bucket 必须 private，路径 `{user_id}/{resume_id}/original.pdf`。
- 服务端独立校验文件大小（≤10MB）与路径归属；删除简历须连带删 Storage 原文件。
- 服务端错误信息脱敏后返回，原始错误仅进服务端日志。
