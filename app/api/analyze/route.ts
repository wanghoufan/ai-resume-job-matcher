import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type Provider = "deepseek" | "qwen" | "kimi" | "doubao";
type AnalyzeRequest = { resumeText?: string; jobDescription?: string; provider?: Provider; model?: string; apiKey?: string; resumeId?: string; filePath?: string; fileName?: string; fileSizeBytes?: number };
type ModelResponse = { ok: boolean; status: number; json: () => Promise<unknown> };
type UpstreamPayload = { id?: string; choices?: Array<{ message?: { content?: unknown } }> };

class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const curlPreferredOrigins = new Set<string>();
const providerEndpoints: Record<Provider, string> = {
  deepseek: "https://api.deepseek.com/chat/completions",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  kimi: "https://api.moonshot.cn/v1/chat/completions",
  doubao: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
};
const systemPrompt = `你是一名资深招聘顾问。根据简历与岗位描述生成中文求职建议。只返回严格合法的 JSON，不要 Markdown、不要代码围栏。JSON 必须完全符合：
{
  "matchScore": 0-100的整数,
  "matchAnalysis": "包含优势、差距和行动建议的分析",
  "optimizationSuggestions": ["具体简历优化建议，至少5条"],
  "coverLetter": "一封自然、专业的中文求职信",
  "interviewQuestions": [{"question":"问题", "referenceAnswer":"参考回答"}],
  "radarSkills": [{"name":"专业技能", "score":0-100}, {"name":"项目经验", "score":0-100}, {"name":"沟通协作", "score":0-100}, {"name":"行业理解", "score":0-100}, {"name":"问题解决", "score":0-100}, {"name":"岗位契合度", "score":0-100}]
}
interviewQuestions 必须恰好有10项，radarSkills 必须恰好有6项且采用以上六个维度。`;

function error(message: string, status = 400) { return NextResponse.json({ error: message }, { status }); }
function parseModelContent(content: unknown) {
  if (typeof content !== "string") throw new Error("模型没有返回文本内容");
  return JSON.parse(content.replace(/^\`\`\`json\s*/i, "").replace(/^\`\`\`\s*/i, "").replace(/\s*\`\`\`$/, "").trim());
}
function isValidResult(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const result = value as Record<string, unknown>;
  return Number.isInteger(result.matchScore) && (result.matchScore as number) >= 0 && (result.matchScore as number) <= 100 &&
    typeof result.matchAnalysis === "string" && Array.isArray(result.optimizationSuggestions) &&
    typeof result.coverLetter === "string" && Array.isArray(result.interviewQuestions) && result.interviewQuestions.length === 10 &&
    Array.isArray(result.radarSkills) && result.radarSkills.length === 6;
}
function networkErrorDetails(caught: unknown) {
  if (!(caught instanceof Error)) return { name: "UnknownError" };
  const cause = caught.cause && typeof caught.cause === "object" ? caught.cause as { code?: string; name?: string } : undefined;
  return { name: caught.name, code: cause?.code, cause: cause?.name };
}
async function requestWithCurl(endpoint: string, apiKey: string, requestBody: string): Promise<ModelResponse> {
  const secureDir = await mkdtemp(join(tmpdir(), "ai-resume-matcher-"));
  const headerPath = join(secureDir, "headers.txt");
  await writeFile(headerPath, `Content-Type: application/json\nAuthorization: Bearer ${apiKey}\n`, { encoding: "utf8", mode: 0o600 });
  try {
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn("curl", ["--silent", "--show-error", "--max-time", "90", "--request", "POST", "--header", `@${headerPath}`, "--data-binary", "@-", "--write-out", "\n__AI_RESUME_MATCHER_STATUS__:%{http_code}", endpoint], { stdio: ["pipe", "pipe", "pipe"] });
      let stdout = ""; let stderr = "";
      child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => { stdout += chunk; }); child.stderr.on("data", (chunk: string) => { stderr += chunk; });
      child.on("error", reject); child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`curl transport failed (${code}): ${stderr.slice(0, 160)}`)));
      child.stdin.end(requestBody);
    });
    const marker = "\n__AI_RESUME_MATCHER_STATUS__:"; const markerIndex = output.lastIndexOf(marker);
    if (markerIndex < 0) throw new Error("curl response status is missing");
    const responseText = output.slice(0, markerIndex); const status = Number(output.slice(markerIndex + marker.length));
    return { ok: status >= 200 && status < 300, status, json: async () => JSON.parse(responseText) };
  } finally { await rm(secureDir, { recursive: true, force: true }); }
}
async function requestModel(endpoint: string, apiKey: string, requestBody: string): Promise<ModelResponse> {
  const origin = new URL(endpoint).origin;
  if (curlPreferredOrigins.has(origin)) return requestWithCurl(endpoint, apiKey, requestBody);
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 60_000);
  try { return await fetch(endpoint, { method: "POST", signal: controller.signal, headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, body: requestBody }); }
  catch (caught) { curlPreferredOrigins.add(origin); console.warn("[api/analyze] Node fetch failed; retrying with curl", networkErrorDetails(caught)); return requestWithCurl(endpoint, apiKey, requestBody); }
  finally { clearTimeout(timeout); }
}

export async function POST(request: Request) {
  let body: AnalyzeRequest;
  try { body = await request.json(); } catch { return error("请求格式无效。"); }
  const resumeText = body.resumeText?.trim(); const jobDescription = body.jobDescription?.trim();
  if (!resumeText) return error("请先上传并解析包含文字的简历 PDF。");
  if (!jobDescription) return error("请粘贴目标岗位描述。");
  const resumeId = body.resumeId; const filePath = body.filePath; const fileName = body.fileName; const fileSizeBytes = body.fileSizeBytes;
  if (!resumeId || !uuidPattern.test(resumeId) || !filePath || !fileName || typeof fileSizeBytes !== "number" || !Number.isFinite(fileSizeBytes)) return error("简历文件信息不完整，请重新上传后再试。");

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") return error("请先登录，再保存与生成分析记录。", 401);
  if (!filePath.startsWith(`${userId}/${resumeId}/`) || fileSizeBytes < 1 || fileSizeBytes > 10 * 1024 * 1024) return error("简历文件校验失败，请重新上传。");

  const provider = body.provider;
  if (!provider || !(provider in providerEndpoints)) return error("请选择受支持的模型厂商。");
  const endpoint = providerEndpoints[provider];
  const model = body.model?.trim() || "";
  const apiKey = body.apiKey?.trim();
  if (!model || !apiKey) return error("请完整填写模型名称和 API Key。");

  const { data: quotaRows, error: quotaError } = await supabase.rpc("reserve_analysis_quota");
  if (quotaError) {
    console.error("[api/analyze] Quota reservation failed", quotaError.code || "UnknownQuotaError");
    return error("暂时无法确认会员额度，请稍后重试。", 503);
  }
  const quota = Array.isArray(quotaRows) ? quotaRows[0] : quotaRows;
  if (!quota?.allowed || typeof quota.usage_period_id !== "string") {
    return error("本期 AI 分析额度已用完，请升级套餐或下个周期再试。", 429);
  }
  const usagePeriodId = quota.usage_period_id as string;
  let analysisId: string | undefined;
  let completed = false;
  try {
    const { error: resumeError } = await supabase.from("resumes").insert({ id: resumeId, user_id: userId, title: fileName.replace(/\.pdf$/i, "").slice(0, 120), file_path: filePath, file_name: fileName.slice(0, 255), file_size_bytes: Math.floor(fileSizeBytes), extracted_text: resumeText, is_active: false });
    if (resumeError) throw new RequestError("无法保存简历，请重新上传后重试。", 500);
    const { data: job, error: jobError } = await supabase.from("job_descriptions").insert({ user_id: userId, position_title: jobDescription.split(/[\n。；]/)[0].slice(0, 120) || "未命名岗位", content: jobDescription }).select("id").single();
    if (jobError || !job) throw new RequestError("无法保存岗位描述，请重试。", 500);
    const { data: analysis, error: analysisError } = await supabase.from("analyses").insert({ user_id: userId, resume_id: resumeId, job_description_id: job.id, status: "processing", model, provider, prompt_version: "v1", result_schema_version: "v1" }).select("id").single();
    if (analysisError || !analysis) throw new RequestError("无法创建分析记录，请重试。", 500);
    analysisId = analysis.id;
    const startedAt = Date.now();
    const upstream = await requestModel(endpoint, apiKey, JSON.stringify({ model, temperature: 0.45, response_format: { type: "json_object" }, ...(provider === "deepseek" ? { thinking: { type: "disabled" } } : {}), messages: [{ role: "system", content: systemPrompt }, { role: "user", content: `【简历】\n${resumeText}\n\n【目标岗位描述】\n${jobDescription}` }] }));
    const payload = await upstream.json() as UpstreamPayload;
    if (!upstream.ok) {
      if (upstream.status === 401 || upstream.status === 403) throw new RequestError("模型服务拒绝了当前 API Key，请检查密钥是否有效。", 401);
      if (upstream.status === 429) throw new RequestError("模型服务请求过于频繁或账户额度不足，请稍后重试。", 429);
      throw new RequestError("模型服务暂时无法完成请求，请检查模型名称和账户状态。", 502);
    }
    const result = parseModelContent(payload.choices?.[0]?.message?.content);
    if (!isValidResult(result)) throw new RequestError("模型返回的结果格式异常，请重试或更换模型。", 422);
    const { error: updateError } = await supabase.from("analyses").update({ status: "completed", match_score: result.matchScore, result_json: result, provider_request_id: payload.id || null, latency_ms: Date.now() - startedAt, completed_at: new Date().toISOString() }).eq("id", analysisId);
    if (updateError) throw new RequestError("分析已完成但保存结果失败，请重试。", 500);
    const { error: usageEventError } = await supabase.from("usage_events").insert({ user_id: userId, analysis_id: analysisId, event_type: "analysis", model, status: "succeeded" });
    if (usageEventError) console.error("[api/analyze] Usage event persistence failed", usageEventError.code);
    completed = true;
    return NextResponse.json({ result, analysis: { id: analysisId, createdAt: new Date().toISOString(), jobSummary: jobDescription.slice(0, 48), provider }, quota: { remaining: quota.remaining } });
  } catch (caught) {
    if (analysisId) await supabase.from("analyses").update({ status: "failed", error_message: caught instanceof RequestError ? caught.message : "模型服务调用失败", completed_at: new Date().toISOString() }).eq("id", analysisId);
    console.error("[api/analyze] Request failed", networkErrorDetails(caught));
    if (caught instanceof RequestError) return error(caught.message, caught.status);
    return error(caught instanceof SyntaxError ? "模型返回的结果不是有效 JSON，请重试或更换模型。" : "无法连接模型服务，请检查网络后重试。", 502);
  } finally {
    if (!completed) {
      const { error: releaseError } = await supabase.rpc("release_analysis_quota", { p_usage_period_id: usagePeriodId });
      if (releaseError) console.error("[api/analyze] Quota release failed", releaseError.code);
    }
  }
}
