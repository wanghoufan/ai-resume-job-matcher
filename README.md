# AI 简历岗位匹配助手

AI 简历岗位匹配助手是一款面向求职准备的工具：既能根据 PDF 简历和岗位描述生成岗位匹配分析，也能把简历内容转成可编辑、可换主题、可公开分享的 HTML 求职主页。

![AI 简历岗位匹配助手首页](public/career-orbit-home.png)

## 功能

- PDF 简历文字提取与格式校验
- 岗位匹配度、优势/差距分析和可执行的简历优化建议
- 定制求职信、10 个面试问题及参考回答、六维能力雷达图
- Supabase 登录、私有简历存储与最近 30 条历史分析记录
- 纯 BYOK：用户临时输入自己的 API Key，支持 DeepSeek、通义千问、Kimi、豆包
- 邮箱魔法链接与 Google OAuth 登录入口
- 在线简历 2.0：从 PDF 或历史分析生成结构化主页草稿
- 草稿编辑、自动保存、模块排序/隐藏和 4 套主题
- 发布前逐项确认联系方式，公开页 `/r/{slug}` 无需登录即可访问
- 发布使用独立公开快照；取消发布后链接立即失效

## 技术栈

- Next.js 15、React 19、TypeScript
- Supabase Auth、Postgres 与私有 Storage
- `pdfjs-dist` 用于浏览器端 PDF 文本解析
- DeepSeek / OpenAI Chat Completions 兼容接口

## 本地运行

要求：Node.js 22 或更高版本。

```bash
npm install
cp .env.example .env.local
npm run dev
```

打开 <http://localhost:3000>。

## 环境变量

在 `.env.local` 中配置：

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

绝不把 `service_role` 或任何用户的 API Key 写入 `NEXT_PUBLIC_` 环境变量或提交到仓库。

## 登录配置

邮箱登录由 Supabase Auth 提供。Google 登录需要在 Google Cloud 与 Supabase Dashboard 中启用 Provider 并设置回调地址，完整步骤见 [SUPABASE_AUTH_SETUP.md](SUPABASE_AUTH_SETUP.md)。

## 在线简历路由与发布

- `/resume-sites/new`：上传 PDF 或选择历史分析，调用 BYOK 模型生成草稿。
- `/resume-sites`：管理自己的在线简历草稿与公开状态。
- `/resume-sites/{id}/edit`：编辑内容、切换主题、预览、发布或取消发布。
- `/r/{slug}`：公开 HTML 页面；只读取启用中的公开快照，不要求访客登录。

Vercel 部署的是整个 Next.js 应用，不是每一份简历。发布或更新简历只会写入 Supabase，无需重新部署；只有代码变化才需要重新构建和部署。生产域名确定后，公开地址形如 `https://<domain>/r/<slug>`。

## BYOK 模型与安全

本项目不提供或保存平台模型密钥。用户每次分析时自行选择厂商、输入模型名称和 API Key；Key 仅在本次服务端转发请求中使用，不保存到数据库、Cookie、本地存储或日志中。

服务端只允许以下固定官方接口，不接受用户自定义 URL：

- DeepSeek：`https://api.deepseek.com/chat/completions`
- 通义千问：`https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`
- Kimi：`https://api.moonshot.cn/v1/chat/completions`
- 豆包：`https://ark.cn-beijing.volces.com/api/v3/chat/completions`

## 常用命令

```bash
npm run dev       # 开发服务
npm run build     # 生产构建与类型检查
npm run start     # 启动生产构建
npx tsc --noEmit  # 仅执行 TypeScript 检查
```

## 当前状态

截至 2026-08-20：

- 在线简历 2.0 已通过 PR #1 合并到 `main`，相关 Supabase 迁移已应用到远程数据库。
- Vercel Production 部署状态为 Ready；正式入口为 <https://ai-resume-job-matcher-eta.vercel.app/resume-sites/new>。
- 公网冒烟已验证：首页和创建页返回 200，未登录私有 API 返回 401；未启用的示例 slug 返回 404。
- 当前发布状态是 `deployed / partial live verified`。仍需完成登录态生成 → 编辑 → 发布 → 未登录访问 → 更新发布 → 取消发布的生产回归。
- 正式产品仍需补充速率限制、隐私告知、Google OAuth/邮件发送配置复核和完整 RLS/Storage 安全审查。
