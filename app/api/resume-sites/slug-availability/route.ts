import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isValidSlug, normalizeSlug } from "@/lib/resume-sites/schema";

export async function GET(request: Request) {
  const slug = normalizeSlug(new URL(request.url).searchParams.get("slug") || "");
  if (!isValidSlug(slug)) return NextResponse.json({ slug, available: false, reason: "链接需为 3–48 位小写字母、数字或连字符。" });
  const supabase = await createClient();
  const { data } = await supabase.from("resume_site_publications").select("site_id").eq("slug", slug).maybeSingle();
  return NextResponse.json({ slug, available: !data });
}
