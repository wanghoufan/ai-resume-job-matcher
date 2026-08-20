import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isThemeKey, normalizeContent } from "@/lib/resume-sites/schema";

async function owner() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  return { supabase, userId: claims?.claims?.sub };
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId } = await owner();
  if (typeof userId !== "string") return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { data, error } = await supabase.from("resume_sites")
    .select("id, title, theme_key, draft_content, revision, updated_at, resume_site_publications(slug,is_active,published_at)")
    .eq("id", id).eq("user_id", userId).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "找不到该在线简历。" }, { status: 404 });
  return NextResponse.json({ site: data });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId } = await owner();
  if (typeof userId !== "string") return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  let body: { title?: unknown; themeKey?: unknown; content?: unknown; revision?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效。" }, { status: 400 }); }
  if (!Number.isInteger(body.revision)) return NextResponse.json({ error: "草稿版本信息缺失。" }, { status: 400 });
  if (!isThemeKey(body.themeKey)) return NextResponse.json({ error: "主题无效。" }, { status: 400 });
  const content = normalizeContent(body.content);
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 160) : "";
  const { data, error } = await supabase.from("resume_sites").update({
    title: title || `${content.basics.fullName || "未命名"}的在线简历`,
    theme_key: body.themeKey,
    draft_content: content,
    revision: (body.revision as number) + 1,
    updated_at: new Date().toISOString(),
  }).eq("id", id).eq("user_id", userId).eq("revision", body.revision as number).select("revision, updated_at").maybeSingle();
  if (error) return NextResponse.json({ error: "草稿保存失败。" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "草稿已在其他页面更新，请刷新后继续。" }, { status: 409 });
  return NextResponse.json({ revision: data.revision, updatedAt: data.updated_at });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, userId } = await owner();
  if (typeof userId !== "string") return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  const { error } = await supabase.from("resume_sites").delete().eq("id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: "删除失败，请稍后重试。" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
