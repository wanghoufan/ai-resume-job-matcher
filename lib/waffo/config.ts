import { Environment, WaffoPancake } from "@waffo/pancake-ts";

export type PaidPlanCode = "pro_monthly" | "pro_yearly";

export const paidPlans: Record<PaidPlanCode, { name: string; price: string; period: string; productId: string }> = {
  pro_monthly: { name: "AI 简历生成网站月度会员", price: "US$1.00", period: "月", productId: process.env.WAFFO_MONTHLY_PRODUCT_ID || "PROD_1pA4rw7rPmMk6nn3PzYx2w" },
  pro_yearly: { name: "AI 简历生成网站年度会员", price: "US$5.00", period: "年", productId: process.env.WAFFO_YEARLY_PRODUCT_ID || "PROD_7asZU0vWjmYVQkpkQlW4Ru" },
};

export const waffoStoreId = process.env.WAFFO_STORE_ID || "STO_5zYSX8m9K88QBtKYWXaiy8";

export function isPaidPlanCode(value: unknown): value is PaidPlanCode {
  return value === "pro_monthly" || value === "pro_yearly";
}

export function createWaffoClient() {
  const merchantId = process.env.WAFFO_MERCHANT_ID || "MER_2oCfJibdYTkbQSF9Y2g4XY";
  const privateKey = process.env.WAFFO_PRIVATE_KEY;
  if (!privateKey) throw new Error("Waffo server credentials are not configured");
  return new WaffoPancake({ merchantId, privateKey, environment: Environment.Test });
}
