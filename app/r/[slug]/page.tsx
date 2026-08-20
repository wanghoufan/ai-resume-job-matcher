import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ResumeRenderer } from "@/components/resume-sites/ResumeRenderer";
import { isThemeKey, normalizeContent } from "@/lib/resume-sites/schema";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function getPublication(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("resume_site_publications")
    .select("slug, theme_key, content_json, seo_title, seo_description, updated_at")
    .eq("slug", slug).eq("is_active", true).maybeSingle();
  return data;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params; const publication = await getPublication(slug);
  if (!publication) return { title: "在线简历不存在" };
  return { title: publication.seo_title, description: publication.seo_description, openGraph: { title: publication.seo_title, description: publication.seo_description, type: "profile" }, robots: { index: true, follow: true } };
}

export default async function PublicResumePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; const publication = await getPublication(slug);
  if (!publication) notFound();
  const theme = isThemeKey(publication.theme_key) ? publication.theme_key : "clean-professional";
  return <ResumeRenderer content={normalizeContent(publication.content_json)} theme={theme}/>;
}
