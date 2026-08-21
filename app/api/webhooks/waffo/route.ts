import { NextResponse } from "next/server";
import { verifyWebhook, WebhookEventType, type WebhookEventData } from "@waffo/pancake-ts";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPaidPlanCode, paidPlans, waffoStoreId } from "@/lib/waffo/config";

export const runtime = "nodejs";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function subscriptionStatus(eventType: string) {
  if (eventType === WebhookEventType.SubscriptionCanceled) return "canceled";
  if (eventType === WebhookEventType.SubscriptionPastDue) return "past_due";
  return "active";
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-waffo-signature");
  let event;
  try { event = verifyWebhook<WebhookEventData>(rawBody, signature, { environment: "test" }); }
  catch { return new NextResponse("Invalid signature", { status: 401 }); }
  if (event.mode !== "test" || event.storeId !== waffoStoreId) return new NextResponse("Ignored", { status: 202 });

  const supportedEvents = new Set<string>([WebhookEventType.SubscriptionActivated, WebhookEventType.SubscriptionPaymentSucceeded, WebhookEventType.SubscriptionCanceling, WebhookEventType.SubscriptionUncanceled, WebhookEventType.SubscriptionUpdated, WebhookEventType.SubscriptionCanceled, WebhookEventType.SubscriptionPastDue]);
  if (!supportedEvents.has(event.eventType)) return new NextResponse("OK");
  const metadata = event.data.orderMetadata;
  const userId = metadata?.userId;
  const planCode = metadata?.planCode;
  const productId = metadata?.productId;
  if (typeof userId !== "string" || !uuidPattern.test(userId) || !isPaidPlanCode(planCode) || productId !== paidPlans[planCode].productId) {
    console.error("[waffo/webhook] Verified event has invalid application metadata", { eventId: event.id, eventType: event.eventType });
    return new NextResponse("Invalid metadata", { status: 400 });
  }

  const amount = Number(event.data.amount);
  const amountCents = Number.isFinite(amount) ? Math.round(amount * 100) : null;
  try {
    const { error } = await createAdminClient().rpc("process_waffo_subscription_event", {
      p_provider_event_id: event.id, p_user_id: userId, p_plan_code: planCode,
      p_subscription_status: subscriptionStatus(event.eventType), p_order_id: event.data.orderId,
      p_event_type: event.eventType, p_amount_cents: amountCents, p_currency: event.data.currency,
      p_occurred_at: event.timestamp, p_period_start: event.data.currentPeriodStart || null,
      p_period_end: event.data.currentPeriodEnd || null,
      p_payload: { mode: event.mode, storeId: event.storeId, productId, paymentStatus: event.data.paymentStatus || null },
    });
    if (error) throw error;
    return new NextResponse("OK");
  } catch (caught) {
    console.error("[waffo/webhook] Persistence failed", caught instanceof Error ? caught.message : "UnknownError");
    return new NextResponse("Webhook processing failed", { status: 500 });
  }
}
