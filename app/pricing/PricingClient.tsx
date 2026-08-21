"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { PaidPlanCode } from "@/lib/waffo/config";

const plans: Array<{ code: PaidPlanCode; name: string; price: string; suffix: string; note: string }> = [
  { code: "pro_monthly", name: "月度会员", price: "US$1", suffix: "/月", note: "适合短期集中求职与体验。" },
  { code: "pro_yearly", name: "年度会员", price: "US$5", suffix: "/年", note: "按年订阅，相当于每月约 US$0.42。" },
];

export function PricingClient() {
  const [user, setUser] = useState<User | null>(null); const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState<PaidPlanCode | null>(null); const [message, setMessage] = useState("");
  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user || null); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { setUser(session?.user || null); setReady(true); });
    if (new URLSearchParams(window.location.search).get("checkout") === "success") setMessage("支付页面已完成，请稍候等待会员状态同步。");
    return () => data.subscription.unsubscribe();
  }, []);

  async function checkout(plan: PaidPlanCode) {
    if (!user) { setMessage("请先返回首页登录，再选择会员套餐。"); return; }
    const checkoutWindow = window.open("about:blank", "_blank");
    if (!checkoutWindow) { setMessage("浏览器拦截了新窗口，请允许弹窗后重试。"); return; }
    checkoutWindow.opener = null;
    setLoading(plan); setMessage("");
    try {
      const response = await fetch("/api/payments/waffo/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
      const payload = await response.json();
      if (!response.ok || typeof payload.checkoutUrl !== "string") throw new Error(payload.error || "无法创建收银台。");
      checkoutWindow.location.href = payload.checkoutUrl;
    } catch (caught) { checkoutWindow.close(); setMessage(caught instanceof Error ? caught.message : "无法创建收银台。"); }
    finally { setLoading(null); }
  }

  return <main className="pricing-shell"><nav className="pricing-nav"><a href="/">← 返回求职助手</a><span>WAFFO PANCAKE · TEST MODE</span></nav><header className="pricing-hero"><p>MEMBERSHIP / 测试环境</p><h1>选择你的求职加速周期</h1><span>当前版本先接通支付与会员状态；具体会员权益将在确认后生效。</span></header><section className="pricing-grid">{plans.map((plan) => <article className="price-card" key={plan.code}><div><span>{plan.name}</span><strong>{plan.price}<small>{plan.suffix}</small></strong><p>{plan.note}</p></div><button disabled={!ready || loading !== null} onClick={() => checkout(plan.code)}>{loading === plan.code ? "正在打开…" : user ? "前往安全收银台 ↗" : "登录后购买"}</button></article>)}</section>{message && <p className="pricing-message" role="status">{message}</p>}<p className="pricing-footnote">付款将在 Waffo Pancake 托管的测试收银台中完成，并在新标签页打开。</p></main>;
}
