import { normalizeContent, type ResumeSiteContent } from "./schema";

export type Provider = "deepseek" | "qwen" | "kimi" | "doubao";

const endpoints: Record<Provider, string> = {
  deepseek: "https://api.deepseek.com/chat/completions",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  kimi: "https://api.moonshot.cn/v1/chat/completions",
  doubao: "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
};

const prompt = `你是资深个人品牌顾问。请把用户的真实简历整理为一个适合招聘方阅读的中文个人主页，而不是复刻 PDF 排版。只输出严格合法的 JSON，不要 Markdown。禁止虚构公司、学历、项目、数据成果、联系方式或链接；无法确认的信息留空。联系方式的 visible 必须为 false。结构必须符合：
{
  "basics":{"fullName":"","headline":"一句清晰的职业定位","summary":"第一人称个人简介","location":""},
  "strengths":[{"id":"strength-1","title":"","description":""}],
  "experiences":[{"id":"experience-1","company":"","role":"","period":"","summary":"","highlights":[""]}],
  "projects":[{"id":"project-1","name":"","role":"","description":"","highlights":[""],"link":""}],
  "education":[{"id":"education-1","school":"","degree":"","period":""}],
  "skillGroups":[{"id":"skill-1","name":"","skills":[""]}],
  "contacts":[{"id":"contact-1","type":"email|phone|website|github|linkedin|other","label":"","value":"","url":"","visible":false}],
  "cta":{"headline":"期待与你聊聊新的机会","label":"联系我","href":""},
  "sectionOrder":["strengths","experiences","projects","education","skills"],
  "hiddenSections":[]
}`;

function parseJson(content: unknown) {
  if (typeof content !== "string") throw new Error("模型没有返回可解析内容");
  return JSON.parse(content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim());
}

export async function generateResumeSite(input: { provider: Provider; model: string; apiKey: string; resumeText: string; analysisContext?: string; positioning?: string }): Promise<ResumeSiteContent> {
  const endpoint = endpoints[input.provider];
  if (!endpoint) throw new Error("不支持的模型厂商");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 75_000);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey}` },
      body: JSON.stringify({
        model: input.model,
        temperature: 0.35,
        response_format: { type: "json_object" },
        ...(input.provider === "deepseek" ? { thinking: { type: "disabled" } } : {}),
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: `【期望定位】\n${input.positioning || "请根据经历提炼"}\n\n【简历原文】\n${input.resumeText}\n\n【已有岗位分析，可为空】\n${input.analysisContext || ""}` },
        ],
      }),
      cache: "no-store",
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error("模型服务拒绝了当前 API Key，请检查密钥。");
      if (response.status === 429) throw new Error("模型服务请求过于频繁或额度不足，请稍后重试。");
      throw new Error("模型服务暂时无法生成在线简历，请检查模型名称和账户状态。");
    }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
    const content = normalizeContent(parseJson(payload.choices?.[0]?.message?.content));
    if (!content.basics.fullName || !content.basics.headline || !content.basics.summary) throw new Error("模型返回内容不完整，请重试或更换模型。");
    return content;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("模型生成超时，请稍后重试。");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function isProvider(value: unknown): value is Provider {
  return typeof value === "string" && value in endpoints;
}
