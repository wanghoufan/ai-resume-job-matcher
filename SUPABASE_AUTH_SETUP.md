# Supabase 登录配置

前端已使用 Supabase PKCE OAuth 回调 `/auth/callback`。Google 登录还需要在 Google Cloud 和 Supabase Dashboard 各配置一次。

## 1. Google Cloud

1. 在 Google Auth Platform 中配置 Branding、Audience 和 Data Access。
2. 创建类型为 **Web application** 的 OAuth Client。
3. Authorized JavaScript origins 添加实际站点域名；本地开发添加 `http://localhost:3000`。
4. Authorized redirect URIs 添加：

   `https://piaaacqfffllqrobcmna.supabase.co/auth/v1/callback`

## 2. Supabase Dashboard

1. 打开 **Authentication → Sign In / Providers → Google**。
2. 开启 Google，填入上一步的 Client ID 和 Client Secret，然后保存。
3. 打开 **Authentication → URL Configuration**：
   - Site URL 填写实际站点地址。
   - Redirect URLs 添加实际站点的 `https://<your-domain>/auth/callback` 和本地的 `http://localhost:3000/auth/callback`。

## 3. 邮件登录限额

Supabase 内置邮件服务只适合演示，额度很低。要在生产环境继续使用魔法链接：

1. 在 **Authentication → Emails → SMTP Settings** 配置 Resend、AWS SES、Postmark 或其他 SMTP 服务。
2. 验证发信域名的 SPF、DKIM 和 DMARC。
3. 在 **Authentication → Rate Limits** 按 SMTP 服务商额度调整邮件限额。

配置完成后可以用以下请求验证：

```bash
curl -sS "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/settings" \
  -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
```

返回的 `external.google` 应为 `true`。
