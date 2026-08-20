import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { data, error } = await supabase.from("resume_sites")
    .select("id, title, theme_key, generation_status, updated_at, resume_site_publications(slug,is_active,published_at)")
    .eq("user_id", userId).order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: "在线简历列表加载失败。" }, { status: 500 });
  return NextResponse.json({ sites: data || [] });
}
