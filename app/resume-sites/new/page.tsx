"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { themeKeys, type ThemeKey } from "@/lib/resume-sites/schema";
import styles from "../resume-sites.module.css";

type Provider = "deepseek" | "qwen" | "kimi" | "doubao";
type SourceItem = { id: string; created_at: string; match_score: number; resumes: { title?: string } | { title?: string }[] | null; job_descriptions: { position_title?: string } | { position_title?: string }[] | null };
const providers: Array<{ id: Provider; name: string; model: string }> = [{ id: "deepseek", name: "DeepSeek", model: "deepseek-v4-flash" }, { id: "qwen", name: "通义千问", model: "qwen-plus" }, { id: "kimi", name: "Kimi", model: "kimi-k2.5" }, { id: "doubao", name: "豆包", model: "doubao-seed-2-0-lite-260215" }];
const themes: Array<{ id: ThemeKey; name: string; desc: string }> = [{ id: "clean-professional", name: "清爽专业", desc: "克制、清晰、通用" }, { id: "product-launch", name: "产品主页风", desc: "价值主张与成果导向" }, { id: "creative-portfolio", name: "创意作品集风", desc: "编辑式项目叙事" }, { id: "enterprise-tech", name: "企业科技风", desc: "深色、理性、技术感" }];

export default function NewResumeSitePage() {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [sourceType, setSourceType] = useState<"pdf_upload" | "analysis_history">("pdf_upload");
  const [resumeText, setResumeText] = useState("");
  const [fileName, setFileName] = useState("");
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [analysisId, setAnalysisId] = useState("");
  const [positioning, setPositioning] = useState("");
  const [theme, setTheme] = useState<ThemeKey>(themeKeys[0]);
  const [provider, setProvider] = useState<Provider>("deepseek");
  const [model, setModel] = useState(providers[0].model);
  const [apiKey, setApiKey] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    const cached = sessionStorage.getItem("resume-site-staging");
    if (cached) try { const value = JSON.parse(cached) as { resumeText?: string; fileName?: string; positioning?: string; theme?: ThemeKey }; setResumeText(value.resumeText || ""); setFileName(value.fileName || ""); setPositioning(value.positioning || ""); if (themeKeys.includes(value.theme as ThemeKey)) setTheme(value.theme as ThemeKey); } catch {}
    void supabase.auth.getSession().then(({ data }) => setUser(data.session?.user || null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    sessionStorage.setItem("resume-site-staging", JSON.stringify({ resumeText, fileName, positioning, theme }));
  }, [resumeText, fileName, positioning, theme]);

  useEffect(() => {
    if (!user || sourceType !== "analysis_history") return;
    void fetch("/api/resume-sites/sources").then((response) => response.json()).then((payload) => setSources(payload.sources || []));
  }, [user, sourceType]);

  async function parsePdf(file: File | undefined) {
    setError(""); setResumeText(""); setFileName("");
    if (!file) return;
    if (file.type !== "application/pdf" || file.size > 10 * 1024 * 1024) return setError("请上传不超过 10MB 的 PDF 文件。");
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
      const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
      const pages = await Promise.all(Array.from({ length: pdf.numPages }, async (_, index) => { const page = await pdf.getPage(index + 1); const content = await page.getTextContent(); return content.items.map((item) => "str" in item ? item.str : "").join(" "); }));
      const extracted = pages.join("\n").replace(/[ \t]+/g, " ").trim();
      if (extracted.length < 30) throw new Error("empty");
      setResumeText(extracted); setFileName(file.name);
    } catch { setError("无法从该 PDF 提取足够文字，请上传可选中文字的简历。"); }
  }

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    void parsePdf(event.target.files?.[0]);
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragActive(false);
    void parsePdf(event.dataTransfer.files?.[0]);
  }

  async function signIn(event: FormEvent) {
    event.preventDefault(); setMessage(""); setError("");
    const callback = new URL("/auth/callback", window.location.origin); callback.searchParams.set("next", "/resume-sites/new");
    const { error: signInError } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: callback.toString() } });
    if (signInError) setError(signInError.message); else setMessage("登录链接已发送。完成登录后回到此页，当前材料会保留。");
  }

  async function googleSignIn() {
    const callback = new URL("/auth/callback", window.location.origin); callback.searchParams.set("next", "/resume-sites/new");
    const { data, error: oauthError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callback.toString(), skipBrowserRedirect: true } });
    if (oauthError) setError(oauthError.message); else if (data.url) window.location.assign(data.url);
  }

  async function generate() {
    setError(""); setMessage("");
    if (!user) return setError("请先登录，再调用 AI 生成并保存草稿。");
    if (sourceType === "pdf_upload" && !resumeText) return setError("请先上传并解析 PDF 简历。");
    if (sourceType === "analysis_history" && !analysisId) return setError("请选择一条历史分析记录。");
    if (!model.trim() || !apiKey.trim()) return setError("请填写模型名称和 API Key。");
    setLoading(true);
    try {
      const response = await fetch("/api/resume-sites/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: sourceType === "pdf_upload" ? { type: sourceType, resumeText } : { type: sourceType, analysisId }, positioning, themeKey: theme, provider, model, apiKey }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "生成失败，请重试。");
      sessionStorage.removeItem("resume-site-staging"); setApiKey(""); router.push(`/resume-sites/${payload.site.id}/edit`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "生成失败，请重试。"); }
    finally { setLoading(false); }
  }

  return <main className={styles.shell}><header className={styles.topbar}><a href="/" className={styles.brand}>AI <span>超级求职助手</span></a><nav className={styles.navlinks}><a href="/">岗位匹配</a><a href="/resume-sites">我的在线简历</a></nav></header><div className={styles.content}>
    <section className={styles.intro}><div><p className={styles.eyebrow}>RESUME SITE STUDIO / 2.0</p><h1>把一页简历，变成值得分享的个人主页。</h1></div><p>AI 提炼定位、优势和项目叙事；你决定每一个公开细节。</p></section>
    <section className={styles.panel}><div className={styles.sourceTabs}><button className={`${styles.sourceTab} ${sourceType === "pdf_upload" ? styles.sourceTabActive : ""}`} onClick={() => setSourceType("pdf_upload")}><span className={styles.sourceTabHeader}><strong>上传 PDF 简历</strong>{sourceType === "pdf_upload" && <small>当前方式</small>}</span><span>从一份新的简历开始</span></button><button className={`${styles.sourceTab} ${sourceType === "analysis_history" ? styles.sourceTabActive : ""}`} onClick={() => setSourceType("analysis_history")}><span className={styles.sourceTabHeader}><strong>选择历史分析</strong>{sourceType === "analysis_history" && <small>当前方式</small>}</span><span>沿用岗位定位和已有洞察</span></button></div>
      {sourceType === "pdf_upload" ? <label className={`${styles.upload} ${dragActive ? styles.uploadDragging : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragActive(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false); }} onDrop={handleDrop}><input type="file" accept="application/pdf" onChange={handleFile}/><b>{dragActive ? "↓" : "↗"}</b><strong>{dragActive ? "松开即可上传" : fileName || "拖入 PDF，或点击选择文件"}</strong><span aria-live="polite">{resumeText ? `已解析 ${fileName} · 提取 ${resumeText.length} 个字符` : "仅在浏览器中解析 · PDF 格式 · 最大 10MB"}</span></label> : !user ? <p className={styles.error}>登录后可读取你的历史分析。</p> : <div className={styles.historyList}>{sources.map((item) => { const resume = Array.isArray(item.resumes) ? item.resumes[0] : item.resumes; const job = Array.isArray(item.job_descriptions) ? item.job_descriptions[0] : item.job_descriptions; return <button key={item.id} className={`${styles.historyItem} ${analysisId === item.id ? styles.selected : ""}`} onClick={() => setAnalysisId(item.id)}><div><strong>{resume?.title || "已保存简历"}</strong><span>{job?.position_title || "目标岗位"} · {new Date(item.created_at).toLocaleDateString("zh-CN")}</span></div><b>{item.match_score}分</b></button>; })}{sources.length === 0 && <div className={styles.empty}>暂无可用历史分析</div>}</div>}
      <div className={styles.formGrid} style={{ marginTop: 24 }}><label className={`${styles.field} ${styles.wide}`}><span>期望个人定位（可选）</span><textarea value={positioning} onChange={(event) => setPositioning(event.target.value)} placeholder="例如：5 年 B 端产品经验，擅长从 0 到 1 和复杂业务平台…"/></label></div>
      <p className={styles.eyebrow} style={{ marginTop: 28 }}>CHOOSE A THEME</p><div className={styles.themeGrid}>{themes.map((item) => <button key={item.id} className={`${styles.themeCard} ${theme === item.id ? styles.selected : ""}`} onClick={() => setTheme(item.id)}><div className={styles.themeSwatch}/><strong>{item.name}</strong><span>{item.desc}</span></button>)}</div>
      {!user && <form className={styles.authBox} onSubmit={signIn}><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="输入邮箱，登录后生成"/><button type="submit">发送登录链接</button><button type="button" onClick={googleSignIn}>Google 登录</button></form>}
      {user && <><p className={styles.eyebrow} style={{ marginTop: 28 }}>AI GENERATION / BYOK</p><div className={styles.providerGrid}>{providers.map((item) => <button key={item.id} className={`${styles.providerCard} ${provider === item.id ? styles.selected : ""}`} onClick={() => { setProvider(item.id); setModel(item.model); }}><strong>{item.name}</strong><span>{item.model}</span></button>)}</div><div className={styles.formGrid} style={{ marginTop: 16 }}><label className={styles.field}><span>模型名称</span><input value={model} onChange={(event) => setModel(event.target.value)}/></label><label className={styles.field}><span>API Key</span><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} autoComplete="off" placeholder="只用于本次请求"/></label></div></>}
      {error && <p className={styles.error} role="alert">{error}</p>}{message && <p className={styles.notice}>{message}</p>}<div className={styles.submitRow}><p>AI 不会替你虚构经历；发布前请逐项确认公开信息。</p><button className={styles.button} onClick={generate} disabled={loading}>{loading ? "AI 正在搭建你的主页…" : user ? "生成在线简历草稿 →" : "登录后开始生成"}</button></div>
    </section>
  </div></main>;
}
