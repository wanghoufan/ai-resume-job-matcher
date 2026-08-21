"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { PaidPlanCode } from "@/lib/waffo/config";

type Membership = {
  subscription: { planCode: string; planName: string; status: string; isMember: boolean; isActive: boolean; currentPeriodEnd: string | null };
  quota: { analysisLimit: number; analysisUsed: number; remaining: number };
};

const plans: Array<{ code: PaidPlanCode; name: string; price: string; suffix: string; note: string }> = [
  { code: "pro_monthly", name: "月度会员", price: "US$1", suffix: "/月", note: "每自然月 300 次 AI 分析额度。" },
  { code: "pro_yearly", name: "年度会员", price: "US$5", suffix: "/年", note: "每自然月 4000 次 AI 分析额度。" },
];
const statusLabels: Record<string, string> = { trialing: "试用中", active: "已生效", past_due: "付款逾期", canceled: "已取消", expired: "已到期" };

export function PricingClient() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState<PaidPlanCode | null>(null);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  const loadMembership = useCallback(async () => {
    const response = await fetch("/api/membership", { cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json() as Membership;
    setMembership(payload);
    return payload;
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const checkoutSucceeded = new URLSearchParams(window.location.search).get("checkout") === "success";
    void supabase.auth.getSession().then(async ({ data }) => {
      const currentUser = data.session?.user || null;
      setUser(currentUser);
      setReady(true);
      if (!currentUser) return;
      if (!checkoutSucceeded) { await loadMembership(); return; }
      setSyncing(true);
      setMessage("付款已完成，正在确认会员状态…");
      for (let attempt = 0; attempt < 15; attempt += 1) {
        const current = await loadMembership();
        if (current?.subscription.isMember) {
          setMessage("会员已开通，权益已生效。");
          setSyncing(false);
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
      }
      setMessage("付款已提交，会员状态仍在同步。请稍后刷新本页。");
      setSyncing(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setReady(true);
      if (session?.user) void loadMembership(); else setMembership(null);
    });
    return () => data.subscription.unsubscribe();
  }, [loadMembership]);

  async function checkout(plan: PaidPlanCode) {
    if (!user) { setMessage("请先返回首页登录，再选择会员套餐。"); return; }
    const checkoutWindow = window.open("about:blank", "_blank");
    if (!checkoutWindow) { setMessage("浏览器拦截了新窗口，请允许弹窗后重试。"); return; }
    checkoutWindow.opener = null;
    setLoading(plan);
    setMessage("");
    try {
      const response = await fetch("/api/payments/waffo/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
      const payload = await response.json();
      if (!response.ok || typeof payload.checkoutUrl !== "string") throw new Error(payload.error || "无法创建收银台。");
      checkoutWindow.location.href = payload.checkoutUrl;
    } catch (caught) {
      checkoutWindow.close();
      setMessage(caught instanceof Error ? caught.message : "无法创建收银台。");
    } finally { setLoading(null); }
  }

  return <main className="pricing-shell">
    <nav className="pricing-nav"><a href="/">← 返回 AI 超级求职助手</a><span>WAFFO PANCAKE · TEST MODE</span></nav>
    <header className="pricing-hero"><p>MEMBERSHIP / 测试环境</p><h1>选择你的求职加速周期</h1><span>付款成功后，系统会自动确认订阅并更新会员状态。</span></header>
    {membership && <section className={`membership-status ${membership.subscription.isMember ? "is-member" : ""}`}>
      <div><span>当前套餐</span><strong>{membership.subscription.planName}</strong></div>
      <div><span>会员状态</span><strong>{syncing ? "同步中" : statusLabels[membership.subscription.status] || membership.subscription.status}</strong></div>
      <div><span>本期分析额度（每自然月重置）</span><strong>{membership.quota.remaining} / {membership.quota.analysisLimit}</strong></div>
      {membership.subscription.currentPeriodEnd && <div><span>有效期至</span><strong>{new Date(membership.subscription.currentPeriodEnd).toLocaleDateString("zh-CN")}</strong></div>}
    </section>}
    <section className="pricing-grid">{plans.map((plan) => <article className="price-card" key={plan.code}><div><span>{plan.name}</span><strong>{plan.price}<small>{plan.suffix}</small></strong><p>{plan.note}</p></div><button disabled={!ready || loading !== null || syncing} onClick={() => checkout(plan.code)}>{loading === plan.code ? "正在创建订单…" : user ? "立即付款" : "登录后立即付款"}</button></article>)}</section>
    {message && <p className="pricing-message" role="status">{message}</p>}
    <p className="pricing-footnote">点击“立即付款”后，将打开 Waffo Pancake 测试收银台完成安全付款。</p>
  </main>;
}
