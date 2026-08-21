import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") {
    return NextResponse.json({ error: "请先登录后查看会员状态。" }, { status: 401 });
  }

  const { data: subscription, error: subscriptionError } = await supabase
    .from("subscriptions")
    .select("plan_code,status,current_period_start,current_period_end,updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (subscriptionError) {
    console.error("[membership] Subscription lookup failed", subscriptionError.code);
    return NextResponse.json({ error: "暂时无法读取会员状态。" }, { status: 500 });
  }

  const planCode = subscription?.plan_code ?? "free";
  const status = subscription?.status ?? "active";
  const currentPeriodStart = subscription?.current_period_start ?? null;
  const currentPeriodEnd = subscription?.current_period_end ?? null;
  const updatedAt = subscription?.updated_at ?? null;

  const [{ data: plan, error: planError }, { data: usage, error: usageError }] = await Promise.all([
    supabase.from("plans").select("code,name,description,analysis_limit,token_limit").eq("code", planCode).single(),
    supabase.from("usage_periods").select("analysis_limit,analysis_used,period_start,period_end").eq("user_id", userId).lte("period_start", new Date().toISOString()).gt("period_end", new Date().toISOString()).maybeSingle(),
  ]);
  if (planError) {
    console.error("[membership] Plan lookup failed", planError.code);
    return NextResponse.json({ error: "暂时无法读取套餐信息。" }, { status: 500 });
  }
  if (usageError) console.error("[membership] Usage lookup failed", usageError.code);

  const periodEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : null;
  const statusAllowsAccess = status === "active" || status === "trialing";
  const isActive = statusAllowsAccess && (!periodEnd || periodEnd.getTime() > Date.now());
  const analysisLimit = plan?.analysis_limit ?? 0;
  const analysisUsed = usage?.analysis_used ?? 0;

  return NextResponse.json({
    subscription: {
      planCode,
      planName: plan?.name || planCode,
      status,
      isMember: planCode !== "free" && isActive,
      isActive,
      currentPeriodStart,
      currentPeriodEnd,
      updatedAt,
    },
    quota: {
      analysisLimit,
      analysisUsed,
      remaining: Math.max(analysisLimit - analysisUsed, 0),
      periodStart: usage?.period_start ?? null,
      periodEnd: usage?.period_end ?? null,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
