import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { contentIsPublishable, isValidSlug, normalizeContent, normalizeSlug, publicContent } from "@/lib/resume-sites/schema";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  let body: { slug?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "请求格式无效。" }, { status: 400 }); }
  const slug = normalizeSlug(typeof body.slug === "string" ? body.slug : "");
  if (!isValidSlug(slug)) return NextResponse.json({ error: "公开链接需为 3–48 位小写字母、数字或连字符。" }, { status: 400 });
  const { data: site, error } = await supabase.from("resume_sites").select("id, theme_key, draft_content")
    .eq("id", id).eq("user_id", userId).maybeSingle();
  if (error || !site) return NextResponse.json({ error: "找不到该在线简历。" }, { status: 404 });
  const content = normalizeContent(site.draft_content);
  if (!contentIsPublishable(content)) return NextResponse.json({ error: "请先填写姓名、职业定位和个人简介。" }, { status: 422 });
  const publication = {
    site_id: id, user_id: userId, slug, theme_key: site.theme_key, content_json: publicContent(content),
    content_schema_version: "v1", seo_title: `${content.basics.fullName}｜${content.basics.headline}`.slice(0, 160),
    seo_description: content.basics.summary.slice(0, 260), is_active: true, updated_at: new Date().toISOString(),
  };
  const { data, error: publishError } = await supabase.from("resume_site_publications").upsert(publication, { onConflict: "site_id" }).select("slug, published_at").single();
  if (publishError) {
    if (publishError.code === "23505") return NextResponse.json({ error: "该公开链接已被使用，请更换一个。" }, { status: 409 });
    return NextResponse.json({ error: "发布失败，请稍后重试。" }, { status: 500 });
  }
  return NextResponse.json({ publication: data });
}
