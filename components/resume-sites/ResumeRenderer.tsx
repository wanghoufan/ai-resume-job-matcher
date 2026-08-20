import type { ReactNode } from "react";
import type { ResumeSiteContent, SectionKey, ThemeKey } from "@/lib/resume-sites/schema";
import styles from "./resume-renderer.module.css";

const labels: Record<SectionKey, string> = { strengths: "核心优势", experiences: "职业经历", projects: "代表项目", education: "教育背景", skills: "技能图谱" };

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <article className={`${styles.card} ${className}`}>{children}</article>;
}

export function ResumeRenderer({ content, theme, preview = false }: { content: ResumeSiteContent; theme: ThemeKey; preview?: boolean }) {
  const hidden = new Set(content.hiddenSections);
  const sections: Record<SectionKey, ReactNode> = {
    strengths: content.strengths.length ? <div className={styles.strengthGrid}>{content.strengths.map((item, index) => <Card key={item.id}><span className={styles.index}>{String(index + 1).padStart(2, "0")}</span><h3>{item.title}</h3><p>{item.description}</p></Card>)}</div> : null,
    experiences: content.experiences.length ? <div className={styles.timeline}>{content.experiences.map((item) => <Card key={item.id} className={styles.timelineCard}><div className={styles.itemTop}><div><h3>{item.role}</h3><strong>{item.company}</strong></div><span>{item.period}</span></div><p>{item.summary}</p>{item.highlights.length > 0 && <ul>{item.highlights.map((point, index) => <li key={`${item.id}-${index}`}>{point}</li>)}</ul>}</Card>)}</div> : null,
    projects: content.projects.length ? <div className={styles.projectGrid}>{content.projects.map((item) => <Card key={item.id}><div className={styles.itemTop}><div><span className={styles.kicker}>PROJECT</span><h3>{item.name}</h3></div>{item.link && <a href={item.link} target="_blank" rel="noreferrer">查看项目 ↗</a>}</div>{item.role && <strong>{item.role}</strong>}<p>{item.description}</p>{item.highlights.length > 0 && <ul>{item.highlights.map((point, index) => <li key={`${item.id}-${index}`}>{point}</li>)}</ul>}</Card>)}</div> : null,
    education: content.education.length ? <div className={styles.educationGrid}>{content.education.map((item) => <Card key={item.id}><span>{item.period}</span><h3>{item.school}</h3><p>{item.degree}</p></Card>)}</div> : null,
    skills: content.skillGroups.length ? <div className={styles.skillGrid}>{content.skillGroups.map((group) => <Card key={group.id}><h3>{group.name}</h3><div className={styles.tags}>{group.skills.map((skill) => <span key={`${group.id}-${skill}`}>{skill}</span>)}</div></Card>)}</div> : null,
  };

  const contacts = content.contacts.filter((item) => item.visible && item.value);
  return <div className={`${styles.site} ${preview ? styles.preview : ""}`} data-theme={theme}>
    <header className={styles.nav}><a className={styles.wordmark} href="#top">{content.basics.fullName || "你的名字"}</a><nav>{content.sectionOrder.filter((key) => !hidden.has(key) && sections[key]).slice(0, 4).map((key) => <a key={key} href={`#${key}`}>{labels[key]}</a>)}</nav></header>
    <main>
      <section className={styles.hero} id="top">
        <div className={styles.heroGlow}/><div className={styles.heroCopy}><span className={styles.eyebrow}>OPEN TO NEW OPPORTUNITIES</span><h1>{content.basics.fullName || "你的名字"}</h1><h2>{content.basics.headline || "用一句话写清你的职业定位"}</h2><p>{content.basics.summary || "这里会展示你的个人简介、专业能力与经历亮点。"}</p><div className={styles.heroActions}>{content.cta.href && <a className={styles.primary} href={content.cta.href}>{content.cta.label || "联系我"}</a>}<a className={styles.secondary} href="#projects">查看我的经历 ↓</a></div></div>
        <aside className={styles.profileCard}><span>PROFILE / 个人名片</span><strong>{content.basics.headline || "职业定位"}</strong>{content.basics.location && <p>常驻 · {content.basics.location}</p>}<div className={styles.signal}><i/><span>正在寻找新的可能</span></div></aside>
      </section>
      {content.sectionOrder.map((key, index) => !hidden.has(key) && sections[key] ? <section className={styles.section} id={key} key={key}><div className={styles.sectionHeading}><span>0{index + 1}</span><div><p>{key.toUpperCase()}</p><h2>{labels[key]}</h2></div></div>{sections[key]}</section> : null)}
      <section className={styles.contact}><span className={styles.eyebrow}>LET&apos;S BUILD SOMETHING MEANINGFUL</span><h2>{content.cta.headline || "期待与你聊聊新的机会"}</h2>{contacts.length > 0 && <div className={styles.contactLinks}>{contacts.map((item) => item.url ? <a key={item.id} href={item.url} target={item.url.startsWith("http") ? "_blank" : undefined} rel="noreferrer"><span>{item.label || item.type}</span><strong>{item.value}</strong></a> : <span key={item.id}><small>{item.label || item.type}</small><strong>{item.value}</strong></span>)}</div>}</section>
    </main>
    <footer className={styles.footer}><span>{content.basics.fullName || "在线简历"}</span><p>Built with AI 超级求职助手</p></footer>
  </div>;
}
