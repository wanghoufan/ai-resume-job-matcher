import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { error } = await supabase.from("resume_site_publications").update({ is_active: false, updated_at: new Date().toISOString() }).eq("site_id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: "取消发布失败。" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
