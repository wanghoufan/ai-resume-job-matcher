# AI 简历岗位匹配助手

AI 简历岗位匹配助手是一款面向求职准备的工具：上传可提取文字的 PDF 简历、粘贴目标岗位描述，即可获得岗位匹配分析、简历优化建议、定制求职信、面试预演题和能力雷达图。

![AI 简历岗位匹配助手首页](public/career-orbit-home.png)

## 功能

- PDF 简历文字提取与格式校验
- 岗位匹配度、优势/差距分析和可执行的简历优化建议
- 定制求职信、10 个面试问题及参考回答、六维能力雷达图
- Supabase 登录、私有简历存储与最近 30 条历史分析记录
- 默认服务端 DeepSeek 模式；自定义 OpenAI Chat Completions 兼容模型模式
- 邮箱魔法链接与 Google OAuth 登录入口

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
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

绝不把 `service_role`、DeepSeek Key 或其他服务端密钥写入 `NEXT_PUBLIC_` 环境变量或提交到仓库。

## 登录配置

邮箱登录由 Supabase Auth 提供。Google 登录需要在 Google Cloud 与 Supabase Dashboard 中启用 Provider 并设置回调地址，完整步骤见 [SUPABASE_AUTH_SETUP.md](SUPABASE_AUTH_SETUP.md)。

## 自定义模型与安全

自定义模型模式用于用户自带 API Key（BYOK）。该 Key 仅用于当前请求，不应保存到数据库、Cookie、本地存储或日志中。用于公开部署前，建议将“请求地址”收敛为受支持厂商的固定地址或严格域名白名单，并限制仅 HTTPS，以降低任意 URL 后端转发带来的 SSRF 风险。

## 常用命令

```bash
npm run dev       # 开发服务
npm run build     # 生产构建与类型检查
npm run start     # 启动生产构建
npx tsc --noEmit  # 仅执行 TypeScript 检查
```

## 当前状态

这是课程作业/原型项目。上线前请完成：Supabase RLS 与 Storage 策略复核、Google OAuth 配置、私有模型地址白名单、速率限制和隐私告知。
