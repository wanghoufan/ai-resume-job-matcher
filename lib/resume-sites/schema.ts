export const themeKeys = ["clean-professional", "product-launch", "creative-portfolio", "enterprise-tech"] as const;
export type ThemeKey = (typeof themeKeys)[number];

export type ResumeSiteContent = {
  basics: { fullName: string; headline: string; summary: string; location: string };
  strengths: Array<{ id: string; title: string; description: string }>;
  experiences: Array<{ id: string; company: string; role: string; period: string; summary: string; highlights: string[] }>;
  projects: Array<{ id: string; name: string; role: string; description: string; highlights: string[]; link?: string }>;
  education: Array<{ id: string; school: string; degree: string; period: string }>;
  skillGroups: Array<{ id: string; name: string; skills: string[] }>;
  contacts: Array<{ id: string; type: "email" | "phone" | "website" | "github" | "linkedin" | "other"; label: string; value: string; url?: string; visible: boolean }>;
  cta: { headline: string; label: string; href: string };
  sectionOrder: SectionKey[];
  hiddenSections: SectionKey[];
};

export const sectionKeys = ["strengths", "experiences", "projects", "education", "skills"] as const;
export type SectionKey = (typeof sectionKeys)[number];

export const emptyContent: ResumeSiteContent = {
  basics: { fullName: "", headline: "", summary: "", location: "" },
  strengths: [], experiences: [], projects: [], education: [], skillGroups: [], contacts: [],
  cta: { headline: "期待与你聊聊新的机会", label: "联系我", href: "" },
  sectionOrder: [...sectionKeys], hiddenSections: [],
};

const text = (value: unknown, max = 5000) => typeof value === "string" ? value.trim().slice(0, max) : "";
const list = (value: unknown) => Array.isArray(value) ? value : [];
const id = (value: unknown, prefix: string, index: number) => text(value, 80) || `${prefix}-${index + 1}`;
const allowedContactTypes = new Set(["email", "phone", "website", "github", "linkedin", "other"]);

export function isThemeKey(value: unknown): value is ThemeKey {
  return typeof value === "string" && (themeKeys as readonly string[]).includes(value);
}

export function normalizeSlug(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

export function isValidSlug(value: string) {
  const reserved = new Set(["admin", "api", "auth", "new", "edit", "login", "resume-sites"]);
  return value.length >= 3 && value.length <= 48 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && !reserved.has(value);
}

export function safeHref(value: unknown) {
  const href = text(value, 1000);
  if (!href) return "";
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol) ? href : "";
  } catch {
    return /^(mailto:|tel:)/i.test(href) ? href : "";
  }
}

export function normalizeContent(value: unknown): ResumeSiteContent {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const basics = source.basics && typeof source.basics === "object" ? source.basics as Record<string, unknown> : {};
  const cta = source.cta && typeof source.cta === "object" ? source.cta as Record<string, unknown> : {};
  const order = list(source.sectionOrder).filter((item): item is SectionKey => typeof item === "string" && (sectionKeys as readonly string[]).includes(item));
  const completeOrder = [...new Set([...order, ...sectionKeys])] as SectionKey[];
  const hidden = list(source.hiddenSections).filter((item): item is SectionKey => typeof item === "string" && (sectionKeys as readonly string[]).includes(item));

  return {
    basics: { fullName: text(basics.fullName, 120), headline: text(basics.headline, 180), summary: text(basics.summary, 2000), location: text(basics.location, 120) },
    strengths: list(source.strengths).slice(0, 12).map((item, index) => { const row = item && typeof item === "object" ? item as Record<string, unknown> : {}; return { id: id(row.id, "strength", index), title: text(row.title, 120), description: text(row.description, 600) }; }),
    experiences: list(source.experiences).slice(0, 20).map((item, index) => { const row = item && typeof item === "object" ? item as Record<string, unknown> : {}; return { id: id(row.id, "experience", index), company: text(row.company, 160), role: text(row.role, 160), period: text(row.period, 100), summary: text(row.summary, 1200), highlights: list(row.highlights).slice(0, 10).map((entry) => text(entry, 500)).filter(Boolean) }; }),
    projects: list(source.projects).slice(0, 20).map((item, index) => { const row = item && typeof item === "object" ? item as Record<string, unknown> : {}; return { id: id(row.id, "project", index), name: text(row.name, 160), role: text(row.role, 160), description: text(row.description, 1200), highlights: list(row.highlights).slice(0, 10).map((entry) => text(entry, 500)).filter(Boolean), link: safeHref(row.link) || undefined }; }),
    education: list(source.education).slice(0, 12).map((item, index) => { const row = item && typeof item === "object" ? item as Record<string, unknown> : {}; return { id: id(row.id, "education", index), school: text(row.school, 160), degree: text(row.degree, 200), period: text(row.period, 100) }; }),
    skillGroups: list(source.skillGroups).slice(0, 12).map((item, index) => { const row = item && typeof item === "object" ? item as Record<string, unknown> : {}; return { id: id(row.id, "skill", index), name: text(row.name, 100), skills: list(row.skills).slice(0, 30).map((entry) => text(entry, 80)).filter(Boolean) }; }),
    contacts: list(source.contacts).slice(0, 12).map((item, index) => { const row = item && typeof item === "object" ? item as Record<string, unknown> : {}; const type = text(row.type, 20); return { id: id(row.id, "contact", index), type: (allowedContactTypes.has(type) ? type : "other") as ResumeSiteContent["contacts"][number]["type"], label: text(row.label, 80), value: text(row.value, 200), url: safeHref(row.url) || undefined, visible: row.visible === true }; }),
    cta: { headline: text(cta.headline, 180), label: text(cta.label, 80), href: safeHref(cta.href) },
    sectionOrder: completeOrder,
    hiddenSections: [...new Set(hidden)],
  };
}

export function publicContent(value: ResumeSiteContent): ResumeSiteContent {
  const content = normalizeContent(value);
  return { ...content, contacts: content.contacts.filter((item) => item.visible) };
}

export function contentIsPublishable(content: ResumeSiteContent) {
  return Boolean(content.basics.fullName && content.basics.headline && content.basics.summary);
}
