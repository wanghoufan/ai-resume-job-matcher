import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { data, error } = await supabase.from("analyses")
    .select("id, created_at, match_score, resumes(title), job_descriptions(position_title)")
    .eq("user_id", userId).eq("status", "completed").order("created_at", { ascending: false }).limit(30);
  if (error) return NextResponse.json({ error: "历史分析加载失败。" }, { status: 500 });
  return NextResponse.json({ sources: data || [] });
}
