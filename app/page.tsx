"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type Provider = "deepseek" | "qwen" | "kimi" | "doubao";
type RadarSkill = { name: string; score: number };
type InterviewQuestion = { question: string; referenceAnswer: string };
type AnalysisResult = {
  matchScore: number;
  matchAnalysis: string;
  optimizationSuggestions: string[];
  coverLetter: string;
  interviewQuestions: InterviewQuestion[];
  radarSkills: RadarSkill[];
};
type HistoryItem = {
  id: string;
  createdAt: string;
  jobSummary: string;
  provider: string;
  result: AnalysisResult;
};

function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!value || typeof value !== "object") return false;
  const result = value as AnalysisResult;
  return typeof result.matchScore === "number" && typeof result.matchAnalysis === "string" &&
    Array.isArray(result.optimizationSuggestions) && typeof result.coverLetter === "string" &&
    Array.isArray(result.interviewQuestions) && result.interviewQuestions.length === 10 &&
    Array.isArray(result.radarSkills) && result.radarSkills.length === 6;
}

const encouragements = [
  "你的未来不是梦。",
  "好岗位正在为你准备。",
  "每一次准备，都离理想更近一步。",
  "把经验变成下一次机会。",
];

const defaultRadar: RadarSkill[] = [
  { name: "专业技能", score: 84 }, { name: "项目经验", score: 76 }, { name: "沟通协作", score: 79 },
  { name: "行业理解", score: 71 }, { name: "问题解决", score: 81 }, { name: "岗位契合度", score: 74 },
];

const providerOptions: Array<{ id: Provider; label: string; defaultModel: string; endpoint: string }> = [
  { id: "deepseek", label: "DeepSeek", defaultModel: "deepseek-v4-flash", endpoint: "https://api.deepseek.com/chat/completions" },
  { id: "qwen", label: "通义千问", defaultModel: "qwen3.7-plus", endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions" },
  { id: "kimi", label: "Kimi", defaultModel: "kimi-k2.5", endpoint: "https://api.moonshot.cn/v1/chat/completions" },
  { id: "doubao", label: "豆包", defaultModel: "doubao-seed-2-0-lite-260215", endpoint: "https://ark.cn-beijing.volces.com/api/v3/chat/completions" },
];

function providerLabel(provider: string) {
  return providerOptions.find((option) => option.id === provider)?.label || "自定义模型";
}

function withAuthTimeout<T>(request: Promise<T>, timeoutMs = 12_000) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("timeout")), timeoutMs);
    request.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (reason) => { window.clearTimeout(timer); reject(reason); },
    );
  });
}

function authErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  return typeof error.code === "string" ? error.code : "";
}

function emailSignInErrorMessage(error: unknown) {
  const code = authErrorCode(error);
  const message = error instanceof Error ? error.message : "";
  if (code === "over_email_send_rate_limit" || /rate limit/i.test(message)) {
    return "邮件登录额度已用完，请稍后再试，或改用 Google 登录。项目上线前请配置自定义 SMTP。";
  }
  if (code === "email_address_not_authorized") {
    return "当前项目的默认邮件服务只能发送给项目成员，请改用 Google 登录或配置自定义 SMTP。";
  }
  return message ? `登录链接未发送：${message}` : "登录链接未发送，请稍后重试。";
}

function googleSignInErrorMessage(error: unknown) {
  const code = authErrorCode(error);
  const message = error instanceof Error ? error.message : "";
  if (code === "oauth_provider_not_supported" || /provider (?:is )?not enabled|unsupported provider/i.test(message)) {
    return "Google 登录尚未启用：请在 Supabase 的 Sign In / Providers 中配置并开启 Google。";
  }
  return message ? `Google 登录暂时不可用：${message}` : "Google 登录暂时无法发起，请稍后重试。";
}

async function isGoogleProviderEnabled() {
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("provider_settings_unavailable");
  const settings = await response.json() as { external?: { google?: boolean } };
  return settings.external?.google === true;
}

function RadarChart({ skills }: { skills: RadarSkill[] }) {
  const chartSkills = skills.length === 6 ? skills : defaultRadar;
  const center = 150;
  const radius = 104;
  const point = (index: number, value: number) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 6;
    const distance = (radius * value) / 100;
    return [center + Math.cos(angle) * distance, center + Math.sin(angle) * distance];
  };
  const polygon = (value: number) => Array.from({ length: 6 }, (_, index) => point(index, value).join(",")).join(" ");
  const resultPolygon = chartSkills.map((skill, index) => point(index, Math.max(0, Math.min(100, skill.score))).join(",")).join(" ");
  return <div className="radar-wrap" aria-label="能力雷达图">
    <svg viewBox="0 0 300 300" role="img">
      <defs>
        <linearGradient id="radar-fill" x1="0" x2="1" y1="0" y2="1"><stop stopColor="#32d5ff" stopOpacity=".55"/><stop offset="1" stopColor="#7568ff" stopOpacity=".13"/></linearGradient>
      </defs>
      {[100, 75, 50, 25].map((value) => <polygon key={value} points={polygon(value)} className="radar-grid" />)}
      {chartSkills.map((_, index) => { const [x, y] = point(index, 100); return <line key={index} x1={center} y1={center} x2={x} y2={y} className="radar-axis" />; })}
      <polygon points={resultPolygon} className="radar-data" />
      {chartSkills.map((skill, index) => { const [x, y] = point(index, Math.max(0, Math.min(100, skill.score))); const [labelX, labelY] = point(index, 124); return <g key={skill.name}><circle cx={x} cy={y} r="4" className="radar-dot"/><text x={labelX} y={labelY} className="radar-label" textAnchor="middle">{skill.name}</text></g>; })}
    </svg>
  </div>;
}

function ResultView({ result }: { result: AnalysisResult }) {
  return <section className="result-stack" id="analysis-result">
    <div className="result-intro panel">
      <div><span className="eyebrow">岗位适配 / MATCH INDEX</span><h2>你的履历正在靠近目标。</h2><p>{result.matchAnalysis}</p></div>
      <div className="score-orbit"><div><strong>{Math.round(result.matchScore)}</strong><span>/100</span><small>匹配指数</small></div></div>
    </div>
    <div className="dashboard-grid">
      <article className="panel radar-panel"><div className="panel-heading"><span className="signal"/>能力轮廓</div><RadarChart skills={result.radarSkills}/></article>
      <article className="panel suggestions"><div className="panel-heading"><span className="signal"/>简历优化行动</div><ol>{result.optimizationSuggestions.map((item, i) => <li key={`${item}-${i}`}><b>{String(i + 1).padStart(2, "0")}</b><span>{item}</span></li>)}</ol></article>
    </div>
    <article className="panel cover-letter"><div className="panel-heading"><span className="signal"/>定制求职信</div><p>{result.coverLetter}</p></article>
    <section className="interviews"><div className="section-title"><span>面试预演</span><p>10 个高概率问题，提前把经历说清楚。</p></div><div className="question-grid">{result.interviewQuestions.map((item, index) => <details key={`${item.question}-${index}`} className="question-card"><summary><b>Q{String(index + 1).padStart(2, "0")}</b><span>{item.question}</span><i>+</i></summary><p>{item.referenceAnswer}</p></details>)}</div></section>
  </section>;
}

export default function Home() {
  const [supabase] = useState(() => createClient());
  const [resumeText, setResumeText] = useState("");
  const [fileName, setFileName] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [provider, setProvider] = useState<Provider>("deepseek");
  const [model, setModel] = useState("deepseek-v4-flash");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [messageIndex, setMessageIndex] = useState(0);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [emailCooldown, setEmailCooldown] = useState(0);

  async function loadHistory() {
    const { data, error: historyError } = await supabase
      .from("analyses")
      .select("id, created_at, match_score, provider, result_json, job_descriptions(content)")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(30);
    if (historyError) return;
    const items = (data || []).flatMap<HistoryItem>((item) => {
      if (!isAnalysisResult(item.result_json)) return [];
      const job = item.job_descriptions as unknown as { content?: string } | { content?: string }[] | null;
      const content = Array.isArray(job) ? job[0]?.content : job?.content;
      return [{
        id: item.id,
        createdAt: new Date(item.created_at).toLocaleString("zh-CN", { hour12: false }),
        jobSummary: content?.slice(0, 48) || "已保存的岗位分析",
        provider: typeof item.provider === "string" ? item.provider : "deepseek",
        result: item.result_json,
      }];
    });
    setHistory(items);
  }

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setAuthReady(true);
      if (data.session?.user) void loadHistory();
    }).catch(() => {
      if (active) setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
      if (session?.user) void loadHistory(); else { setHistory([]); setResult(null); }
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  // The client is created once; this effect intentionally runs once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  useEffect(() => {
    const authState = new URLSearchParams(window.location.search).get("auth");
    if (!authState) return;
    setAuthMessage(authState === "success" ? "登录成功，可以开始分析了。" : "登录链接已失效或无法完成登录，请重新发送一封新的登录链接。");
    window.history.replaceState({}, "", window.location.pathname + window.location.hash);
  }, []);

  useEffect(() => {
    if (!loading) return;
    const timer = window.setInterval(() => setMessageIndex((index) => (index + 1) % encouragements.length), 2200);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    if (emailCooldown <= 0) return;
    const timer = window.setInterval(() => setEmailCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [emailCooldown]);

  const currentMessage = useMemo(() => encouragements[messageIndex], [messageIndex]);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError("");
    setResumeText("");
    setFileName("");
    setResumeFile(null);
    if (!file) return;
    if (file.type !== "application/pdf") { setError("只支持 PDF 格式的简历文件。"); return; }
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      const pages = await Promise.all(Array.from({ length: pdf.numPages }, async (_, i) => {
        const page = await pdf.getPage(i + 1);
        const content = await page.getTextContent();
        return content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      }));
      const text = pages.join("\n").replace(/\s+/g, " ").trim();
      if (!text) throw new Error("empty");
      setResumeText(text); setFileName(file.name); setResumeFile(file);
    } catch {
      setError("未能从该 PDF 提取文字。请上传包含可选中文字的简历 PDF。");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!user) return setError("请先使用邮箱登录，才能保存简历与历史分析记录。");
    if (!resumeText) return setError("请先上传并解析包含文字的简历 PDF。");
    if (!resumeFile) return setError("简历文件已失效，请重新上传后再试。");
    if (!jobDescription.trim()) return setError("请粘贴目标岗位描述。");
    if (!model.trim() || !apiKey.trim()) return setError("请选择厂商，并填写模型名称和 API Key。");
    setLoading(true); setMessageIndex(0);
    try {
      const resumeId = crypto.randomUUID();
      const filePath = `${user.id}/${resumeId}/original.pdf`;
      const { error: uploadError } = await supabase.storage.from("resumes").upload(filePath, resumeFile, { contentType: "application/pdf", upsert: false });
      if (uploadError) throw new Error("简历上传失败，请检查登录状态后重试。");
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resumeText, jobDescription, provider, model, apiKey, resumeId, filePath, fileName: resumeFile.name, fileSizeBytes: resumeFile.size }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "生成失败，请稍后重试。");
      const generated = payload.result as AnalysisResult;
      setResult(generated);
      setHistory((items) => [{ id: payload.analysis.id, createdAt: new Date(payload.analysis.createdAt).toLocaleString("zh-CN", { hour12: false }), jobSummary: payload.analysis.jobSummary, provider, result: generated }, ...items]);
      window.setTimeout(() => document.querySelector("#analysis-result")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "生成失败，请稍后重试。"); }
    finally { setLoading(false); }
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setAuthMessage(""); setError("");
    if (!email.trim()) return setAuthMessage("请输入邮箱地址。");
    setAuthLoading(true);
    try {
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      callbackUrl.searchParams.set("next", "/");
      const { error: signInError } = await withAuthTimeout(supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: callbackUrl.toString() } }));
      if (signInError) setAuthMessage(emailSignInErrorMessage(signInError));
      else {
        setEmailCooldown(60);
        setAuthMessage("登录链接已发送，请前往邮箱（含垃圾邮件）打开链接完成登录。");
      }
    } catch (caught) {
      setAuthMessage(caught instanceof Error && caught.message === "timeout"
        ? "邮件登录服务响应超时，请检查网络或稍后重试。"
        : emailSignInErrorMessage(caught));
    } finally { setAuthLoading(false); }
  }

  async function handleGoogleSignIn() {
    setAuthMessage(""); setError(""); setAuthLoading(true);
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    callbackUrl.searchParams.set("next", "/");
    try {
      const googleEnabled = await withAuthTimeout(isGoogleProviderEnabled());
      if (!googleEnabled) {
        setAuthMessage("Google 登录尚未启用，不会跳转。请先在 Supabase 的 Sign In / Providers 中配置并开启 Google。");
        return;
      }
      const { data, error: googleError } = await withAuthTimeout(supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl.toString(), skipBrowserRedirect: true },
      }));
      if (googleError) {
        setAuthMessage(googleSignInErrorMessage(googleError));
        return;
      }
      if (data.url) { window.location.assign(data.url); return; }
      setAuthMessage("Google 登录暂时无法发起，请稍后重试。");
    } catch (caught) {
      setAuthMessage(caught instanceof Error && caught.message === "timeout"
        ? "Google 登录服务响应超时，请检查网络或稍后重试。"
        : googleSignInErrorMessage(caught));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() { await supabase.auth.signOut(); setAuthMessage(""); }

  return <main>
    <nav className="topbar"><a className="brand" href="#top"><span className="brand-mark">⌁</span><span>AI<span>简历匹配</span></span></a><span className="topbar-note">AI 求职策略室 <i/></span>{!authReady ? <span className="auth-status">正在连接…</span> : user ? <div className="auth-status signed-in"><span>{user.email}</span><button type="button" onClick={handleSignOut}>退出</button></div> : <div className="auth-actions"><form className="auth-form" onSubmit={handleSignIn}><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="邮箱登录" aria-label="邮箱地址"/><button type="submit" disabled={authLoading || emailCooldown > 0}>{authLoading ? "发送中…" : emailCooldown > 0 ? `${emailCooldown} 秒后可重发` : "发送登录链接"}</button></form><button className="google-sign-in" type="button" onClick={handleGoogleSignIn} disabled={authLoading}><span aria-hidden="true">G</span>使用 Google 登录</button></div>}</nav>
    {authMessage && <p className="auth-message" role="status">{authMessage}</p>}
    <section className="hero" id="top"><div className="hero-copy"><p className="eyebrow">01 / YOUR NEXT ROLE</p><h1>让每一份履历<br/><em>向理想岗位校准。</em></h1><p className="hero-lede">上传你的简历和目标职位。AI 会将经历、能力与机会重新连线，给出下一步最值得投入的准备。</p><div className="hero-links"><a href="#workbench" className="text-link">开始岗位校准 <span>↓</span></a><a href="/resume-sites/new" className="text-link resume-site-link">生成在线简历 <span>↗</span></a><a href="/pricing" className="text-link membership-link">会员方案 <span>↗</span></a></div></div><div className="hero-orbit" aria-hidden="true"><div className="orbit-ring ring-one"/><div className="orbit-ring ring-two"/><div className="orbit-core"><small>MATCH</small><strong>∞</strong><small>FUTURE</small></div><span className="satellite s-one"/><span className="satellite s-two"/><span className="orbit-caption">CAREER TRAJECTORY<br/>IS NOT A STRAIGHT LINE</span></div></section>
    <section className="workbench" id="workbench"><div className="section-title"><span>输入材料</span><p>你的经验是起点，目标岗位决定方向。</p></div><form onSubmit={handleSubmit} className="input-grid">
      <label className={`upload-box ${fileName ? "uploaded" : ""}`}><input type="file" accept="application/pdf" onChange={handleFile}/><span className="upload-icon">↗</span><span>{fileName || "投放你的简历 PDF"}</span><small>{fileName ? "文本已提取，准备就绪" : "仅支持可提取文字的 PDF"}</small></label>
      <label className="field job-field"><span>目标岗位描述</span><textarea value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} placeholder="粘贴职位描述、工作职责与任职要求…"/></label>
      <div className="model-card"><div className="model-tabs"><span>自带模型密钥（BYOK）</span></div><div className="custom-fields"><label><span>模型厂商</span><select value={provider} onChange={(event) => { const next = event.target.value as Provider; const option = providerOptions.find((item) => item.id === next); setProvider(next); setModel(option?.defaultModel || ""); }} aria-label="模型厂商">{providerOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label><span>模型名称</span><input value={model} onChange={(event) => setModel(event.target.value)} placeholder="请填写你账户可用的模型名称"/></label><label><span>API Key</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="仅用于本次请求" autoComplete="off"/></label><p>固定使用 {providerOptions.find((option) => option.id === provider)?.endpoint}；密钥仅用于本次请求，不保存、不写入日志。</p></div></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="submit" disabled={loading || !user} type="submit">{loading ? "正在分析" : user ? "开始 AI 分析" : "登录后开始分析"}<span>{loading ? "···" : "→"}</span></button>
    </form></section>
    {loading && <section className="loading-state"><div className="pulse"><i/><i/><i/></div><p className="eyebrow">RESEARCHING YOUR TRAJECTORY</p><h2>AI 正在研究中…</h2><p>{currentMessage}</p></section>}
    {result && <ResultView result={result}/>}
    <section className="history"><div className="section-title"><span>历史分析记录</span><p>{user ? "登录后会自动保留并加载最近 30 条分析记录。" : "登录后即可永久保存简历、岗位材料与分析结果。"}</p></div>{history.length === 0 ? <div className="history-empty">{user ? <>尚未生成分析。<br/>从你的第一份目标岗位开始。</> : <>请先登录。<br/>你的历史分析会安全保存在个人账户中。</>}</div> : <div className="history-list">{history.map((item) => <button key={item.id} onClick={() => { setResult(item.result); window.setTimeout(() => document.querySelector("#analysis-result")?.scrollIntoView({ behavior: "smooth" }), 20); }}><span>{providerLabel(item.provider).toUpperCase()}</span><strong>{item.jobSummary}{item.jobSummary.length >= 48 ? "…" : ""}</strong><small>{item.createdAt} · 匹配度 {item.result.matchScore}</small><i>↗</i></button>)}</div>}</section>
    <footer><span>AI 简历岗位匹配助手</span><p>让准备有方向，让机会看得见。</p></footer>
  </main>;
}
