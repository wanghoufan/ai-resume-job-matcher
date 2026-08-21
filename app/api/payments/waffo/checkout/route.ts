import { NextResponse } from "next/server";
import { WaffoPancakeError } from "@waffo/pancake-ts";
import { createClient } from "@/lib/supabase/server";
import { createWaffoClient, isPaidPlanCode, paidPlans } from "@/lib/waffo/config";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  const email = claimsData?.claims?.email;
  if (claimsError || typeof userId !== "string") return NextResponse.json({ error: "请先登录后再购买会员。" }, { status: 401 });
  let body: { plan?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效。" }, { status: 400 }); }
  if (!isPaidPlanCode(body.plan)) return NextResponse.json({ error: "请选择有效的会员套餐。" }, { status: 400 });

  const plan = paidPlans[body.plan];
  try {
    const origin = new URL(request.url).origin;
    const session = await createWaffoClient().checkout.createSession({
      productId: plan.productId,
      currency: "USD",
      buyerEmail: typeof email === "string" ? email : undefined,
      successUrl: `${origin}/pricing?checkout=success`,
      darkMode: true,
      language: "zh-Hans",
      expiresInSeconds: 3600,
      orderMerchantExternalId: `${userId}:${body.plan}`,
      metadata: { userId, planCode: body.plan, productId: plan.productId },
    });
    return NextResponse.json({ checkoutUrl: session.checkoutUrl, sessionId: session.sessionId, expiresAt: session.expiresAt });
  } catch (caught) {
    if (caught instanceof WaffoPancakeError) console.error("[waffo/checkout] SDK request failed", { status: caught.status, layers: caught.errors.map((item) => item.layer) });
    else console.error("[waffo/checkout] Request failed", caught instanceof Error ? caught.name : "UnknownError");
    return NextResponse.json({ error: "暂时无法创建测试收银台，请检查 Waffo 测试密钥配置。" }, { status: 502 });
  }
}
