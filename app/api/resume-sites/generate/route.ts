import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateResumeSite, isProvider } from "@/lib/resume-sites/ai";
import { isThemeKey } from "@/lib/resume-sites/schema";

export const runtime = "nodejs";

type RequestBody = {
  source?: { type?: "pdf_upload" | "analysis_history"; resumeText?: string; analysisId?: string };
  provider?: unknown; model?: unknown; apiKey?: unknown; positioning?: unknown; themeKey?: unknown;
};

const responseError = (message: string, status = 400) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  let body: RequestBody;
  try { body = await request.json(); } catch { return responseError("请求格式无效。"); }

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") return responseError("请先登录，再生成在线简历。", 401);
  if (!isProvider(body.provider)) return responseError("请选择受支持的模型厂商。");
  const model = typeof body.model === "string" ? body.model.trim() : "";
  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const positioning = typeof body.positioning === "string" ? body.positioning.trim().slice(0, 300) : "";
  const themeKey = isThemeKey(body.themeKey) ? body.themeKey : "clean-professional";
  if (!model || !apiKey) return responseError("请填写模型名称和 API Key。");

  let resumeText = "";
  let analysisContext = "";
  let sourceResumeId: string | null = null;
  let sourceAnalysisId: string | null = null;
  const source = body.source;
  if (!source || (source.type !== "pdf_upload" && source.type !== "analysis_history")) {
    return responseError("请选择 PDF 或历史分析作为生成来源。");
  }
  const sourceType = source.type;
  if (sourceType === "pdf_upload") {
    resumeText = source.resumeText?.trim() || "";
  } else if (sourceType === "analysis_history" && source.analysisId) {
    const { data, error } = await supabase.from("analyses")
      .select("id, resume_id, result_json, resumes(extracted_text)")
      .eq("id", source.analysisId).eq("user_id", userId).eq("status", "completed").single();
    if (error || !data) return responseError("找不到可用的历史分析记录。", 404);
    const resume = data.resumes as unknown as { extracted_text?: string } | { extracted_text?: string }[] | null;
    resumeText = (Array.isArray(resume) ? resume[0]?.extracted_text : resume?.extracted_text)?.trim() || "";
    analysisContext = JSON.stringify(data.result_json || {}).slice(0, 20_000);
    sourceResumeId = data.resume_id;
    sourceAnalysisId = data.id;
  } else return responseError("请选择一条历史分析记录。");
  if (resumeText.length < 30) return responseError("简历文字过少，无法生成在线主页。");
  if (resumeText.length > 100_000) return responseError("简历文字过长，请精简后重试。");

  try {
    const content = await generateResumeSite({ provider: body.provider, model, apiKey, resumeText, analysisContext, positioning });
    const { data, error } = await supabase.from("resume_sites").insert({
      user_id: userId,
      source_type: sourceType,
      source_resume_id: sourceResumeId,
      source_analysis_id: sourceAnalysisId,
      source_text: sourceType === "pdf_upload" ? resumeText : null,
      title: content.basics.fullName ? `${content.basics.fullName}的在线简历` : "未命名在线简历",
      theme_key: themeKey,
      draft_content: content,
      generation_status: "ready",
    }).select("id, revision").single();
    if (error || !data) throw new Error("在线简历已生成，但草稿保存失败，请重试。");
    return NextResponse.json({ site: { id: data.id, revision: data.revision }, content });
  } catch (caught) {
    console.error("[resume-sites/generate] failed", caught instanceof Error ? { name: caught.name, message: caught.message.replace(/key[^。]*/ig, "key 已脱敏") } : { name: "UnknownError" });
    return responseError(caught instanceof Error ? caught.message.trim() : "生成失败，请稍后重试。", 502);
  }
}
