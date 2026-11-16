// Pure HTML builders shared by the browser preview (iframe srcDoc) and the Playwright export,
// so what you see in the editor is exactly what gets rendered.
import { FORMATS, type Brand, type Concept, type FormatId, type Layout } from "./types";

export type TemplateAssets = {
  background: string | null;
  logo: string | null;
  screenshot: string | null;
  /** Uploaded font files, already resolved to URLs or data URIs. */
  fontFaces: { family: string; src: string }[];
};

export type TemplateInput = {
  brand: Pick<Brand, "name" | "colors" | "fonts">;
  copy: Pick<Concept, "headline" | "supportingCopy" | "cta">;
  layout: Layout;
  format: FormatId;
  assets: TemplateAssets;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const lines = (s: string) => esc(s.trim()).replace(/\n+/g, "<br>");

function luminance(hex: string): number {
  const m = /^#?([\da-f]{6})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const inkOn = (bg: string) => (luminance(bg) > 0.45 ? "#111111" : "#ffffff");

// Values below are interpolated into CSS, where HTML escaping is not enough: a newline or quote can end the
// string and inject rules that make the renderer fetch arbitrary URLs. Allow only plain values.
const hex = (v: string, fallback: string) => (/^#[\da-f]{6}$/i.test(v) ? v : fallback);
const fontName = (v: string) => v.replace(/[^\p{L}\p{N} ._-]/gu, "").trim().slice(0, 60);
const TEMPLATE_IDS = new Set(["overlay", "split", "showcase"]);
const LOGOS = new Set(["top-left", "top-center", "top-right", "bottom", "none"]);
const CTAS = new Set(["solid", "outline", "pill"]);

export function safeLayout(l: Layout): Layout {
  return {
    template: TEMPLATE_IDS.has(l.template) ? l.template : "overlay",
    logo: LOGOS.has(l.logo) ? l.logo : "top-left",
    ctaStyle: CTAS.has(l.ctaStyle) ? l.ctaStyle : "pill",
    scrim: Number.isFinite(l.scrim) ? Math.min(100, Math.max(0, l.scrim)) : 60,
    screenshotFile: typeof l.screenshotFile === "string" ? l.screenshotFile : null,
  };
}

function headlineSize(text: string, base: number): number {
  const len = Math.max(1, text.trim().length);
  return Math.round(base * Math.max(0.62, Math.min(1, Math.sqrt(30 / len))));
}

function googleFontsLink(families: string[]): string {
  const unique = [...new Set(families.filter(Boolean))];
  if (!unique.length) return "";
  const q = unique.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700;800`).join("&");
  return `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${q}&display=block">`;
}

export function selectedVersion(concept: Concept) {
  return concept.versions.find((v) => v.id === concept.selectedVersionId) ?? concept.versions.at(-1) ?? null;
}

/** The selected version, unless another version was generated in this format's own aspect ratio. */
export function versionFor(concept: Concept, format: FormatId) {
  const selected = selectedVersion(concept);
  const aspect = FORMATS.find((f) => f.id === format)!.aspect;
  if (!selected || selected.aspect === aspect) return selected;
  return concept.versions.filter((v) => v.aspect === aspect).at(-1) ?? selected;
}

/** The chosen product screenshot if it still exists, otherwise the first one in the brand profile. */
export function screenshotFor(brand: Pick<Brand, "assets">, concept: Concept): string | null {
  const shots = brand.assets.filter((a) => a.kind === "screenshot").map((a) => a.file);
  const chosen = concept.layout.screenshotFile;
  return chosen && shots.includes(chosen) ? chosen : (shots[0] ?? null);
}

/** Exactly the files a format's render needs: the export inlines only these. */
export function filesFor(brand: Brand, concept: Concept, format: FormatId): string[] {
  const layout = safeLayout(concept.layout);
  return [
    versionFor(concept, format)?.file,
    layout.logo !== "none" ? brand.logoFile : null,
    layout.template === "showcase" ? screenshotFor(brand, concept) : null,
    ...brand.assets.filter((a) => a.kind === "font").map((a) => a.file),
  ].filter((f): f is string => Boolean(f));
}

/** Builds template input; `resolve` maps a data/ads-relative path to a URL (preview) or data URI (export). */
export function templateInputFor(brand: Brand, concept: Concept, format: FormatId, resolve: (rel: string) => string): TemplateInput {
  const version = versionFor(concept, format);
  const shot = screenshotFor(brand, concept);
  return {
    brand,
    copy: concept,
    layout: concept.layout,
    format,
    assets: {
      background: version ? resolve(version.file) : null,
      logo: brand.logoFile ? resolve(brand.logoFile) : null,
      screenshot: shot ? resolve(shot) : null,
      fontFaces: brand.assets.filter((a) => a.kind === "font").map((a) => ({ family: a.label, src: resolve(a.file) })),
    },
  };
}

export function dimensions(format: FormatId) {
  return FORMATS.find((f) => f.id === format)!;
}

export function renderAdHtml(input: TemplateInput): string {
  const { brand, copy, format, assets } = input;
  const layout = safeLayout(input.layout);
  const { width: W, height: H } = dimensions(format);
  const raw = brand.colors;
  const c = {
    primary: hex(raw.primary, "#7c3aed"),
    secondary: hex(raw.secondary, "#1e1b4b"),
    accent: hex(raw.accent, "#f59e0b"),
    background: hex(raw.background, "#faf7f2"),
    text: hex(raw.text, "#1b1a17"),
  };
  const heading = fontName(brand.fonts.heading) || "Georgia";
  const bodyFamily = fontName(brand.fonts.body) || "Arial";
  const story = format === "story";
  const square = format === "square";
  // Meta overlays profile/CTA UI on Stories: keep text out of the top ~250px and bottom ~340px.
  const safeTop = story ? 230 : 64;
  const safeBottom = story ? 330 : 72;
  const pad = 72;

  const fontFaces = assets.fontFaces
    .map((f) => ({ family: fontName(f.family), src: f.src }))
    .filter((f) => f.family && /^(data:[\w/+.-]+;base64,[\w+/=]+|\/api\/ads\/files\/[\w%./-]+)$/.test(f.src));
  const uploaded = new Set(fontFaces.map((f) => f.family.toLowerCase()));
  const remote = [heading, bodyFamily].filter((f) => !uploaded.has(f.toLowerCase()));
  const faces = fontFaces.map((f) => `@font-face{font-family:"${f.family}";src:url("${f.src}");font-display:block}`).join("");
  const headFont = `"${heading}", Georgia, serif`;
  const bodyFont = `"${bodyFamily}", "Segoe UI", Arial, sans-serif`;

  const base = story ? 96 : square ? 74 : 84;
  const hSize = headlineSize(copy.headline, layout.template === "showcase" ? base * 0.86 : base);
  const ctaBg = c.accent;
  const ctaInk = inkOn(ctaBg);
  const ctaCss =
    layout.ctaStyle === "outline"
      ? `background:transparent;color:var(--cta-outline);border:4px solid var(--cta-outline);border-radius:14px;`
      : layout.ctaStyle === "pill"
        ? `background:${ctaBg};color:${ctaInk};border-radius:999px;`
        : `background:${ctaBg};color:${ctaInk};border-radius:14px;`;

  const logoHtml = (onDark: boolean) =>
    layout.logo === "none"
      ? ""
      : assets.logo
        ? `<img class="logo" src="${assets.logo}" alt="">`
        : `<div class="wordmark" style="color:${onDark ? "#fff" : c.secondary}">${esc(brand.name)}</div>`;
  const logoPos =
    layout.logo === "top-center" ? "left:50%;transform:translateX(-50%);" : layout.logo === "top-right" ? `right:${pad}px;` : `left:${pad}px;`;
  const topLogo = (onDark: boolean) => (layout.logo.startsWith("top") ? `<div class="logo-wrap" style="top:${safeTop}px;${logoPos}">${logoHtml(onDark)}</div>` : "");
  const bottomLogo = (onDark: boolean) => (layout.logo === "bottom" ? `<div class="logo-inline">${logoHtml(onDark)}</div>` : "");

  const bg = assets.background ? `<img class="bg" src="${assets.background}" alt="">` : `<div class="bg" style="background:linear-gradient(135deg,${c.secondary},${c.primary})"></div>`;
  const scrim = layout.scrim / 100;

  const copyBlock = (ink: string, sub: string) => `
    <h1 style="color:${ink};font-size:${hSize}px">${lines(copy.headline)}</h1>
    ${copy.supportingCopy.trim() ? `<p class="sub" style="color:${sub}">${lines(copy.supportingCopy)}</p>` : ""}
    ${copy.cta.trim() ? `<div class="cta" style="${ctaCss}">${esc(copy.cta)}</div>` : ""}`;

  let body: string;
  if (layout.template === "split") {
    // The panel takes the height its copy needs; the photo fills what's left (at least a third of the frame).
    const panel = c.secondary;
    const ink = inkOn(panel);
    body = `
      <div class="split">
        <div class="split-photo" style="min-height:${Math.round(H * 0.34)}px">${bg}</div>
        <div class="split-panel" style="background:${panel};padding:${story ? 64 : 56}px ${pad}px ${safeBottom}px;--cta-outline:${ink}">
          <div class="accent-bar" style="background:${c.accent}"></div>
          ${copyBlock(ink, ink === "#ffffff" ? "rgba(255,255,255,.82)" : "rgba(0,0,0,.7)")}
          ${bottomLogo(ink === "#ffffff")}
        </div>
      </div>
      ${topLogo(true)}`;
  } else if (layout.template === "showcase") {
    const ink = inkOn(c.background);
    const phoneH = Math.round(H * (story ? 0.48 : square ? 0.52 : 0.5));
    const shot = assets.screenshot
      ? `<img src="${assets.screenshot}" alt="">`
      : `<div class="shot-missing">Adicione um screenshot do produto</div>`;
    body = `
      <div class="photo" style="height:${H}px">${bg}</div>
      <div class="tint" style="background:${c.background};opacity:.86"></div>
      ${topLogo(ink === "#ffffff")}
      <div class="showcase" style="padding:${safeTop + (layout.logo.startsWith("top") ? 110 : 0)}px ${pad}px ${safeBottom}px;--cta-outline:${ink}">
        <h1 style="color:${ink};font-size:${hSize}px;text-align:center">${lines(copy.headline)}</h1>
        <div class="phone" style="max-height:${phoneH}px;box-shadow:0 40px 80px -20px ${c.primary}66">${shot}</div>
        ${copy.supportingCopy.trim() ? `<p class="sub" style="color:${ink};opacity:.78;text-align:center">${lines(copy.supportingCopy)}</p>` : ""}
        ${copy.cta.trim() ? `<div class="cta" style="${ctaCss}">${esc(copy.cta)}</div>` : ""}
        ${bottomLogo(ink === "#ffffff")}
      </div>`;
  } else {
    body = `
      <div class="photo" style="height:${H}px">${bg}</div>
      <div class="scrim" style="background:linear-gradient(to top, rgba(0,0,0,${scrim}) 0%, rgba(0,0,0,${scrim * 0.75}) 35%, rgba(0,0,0,0) 68%), linear-gradient(to bottom, rgba(0,0,0,${scrim * 0.45}) 0%, rgba(0,0,0,0) 22%)"></div>
      ${topLogo(true)}
      <div class="overlay-copy" style="padding:0 ${pad}px ${safeBottom}px;--cta-outline:#ffffff">
        <div class="accent-bar" style="background:${c.accent}"></div>
        ${copyBlock("#ffffff", "rgba(255,255,255,.9)")}
        ${bottomLogo(true)}
      </div>`;
  }

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
${googleFontsLink(remote)}
<style>${faces}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden;background:${c.background}}
.ad{position:relative;width:${W}px;height:${H}px;overflow:hidden;font-family:${bodyFont};-webkit-font-smoothing:antialiased}
.photo{position:absolute;left:0;top:0;width:100%;overflow:hidden}
.bg{width:100%;height:100%;object-fit:cover;display:block}
.scrim,.tint{position:absolute;inset:0}
.logo-wrap{position:absolute;z-index:3}
.logo{max-height:${story ? 84 : 72}px;max-width:340px;display:block;object-fit:contain}
.wordmark{font-family:${headFont};font-weight:700;font-size:${story ? 46 : 40}px;letter-spacing:-.01em}
.logo-inline{margin-top:40px}
h1{font-family:${headFont};font-weight:700;line-height:1.04;letter-spacing:-.02em;text-wrap:balance}
.sub{font-size:${story ? 40 : square ? 32 : 36}px;line-height:1.3;margin-top:24px;font-weight:500;text-wrap:pretty}
.cta{display:inline-block;margin-top:40px;padding:26px 48px;font-size:${story ? 38 : 34}px;font-weight:700;letter-spacing:.01em;line-height:1}
.accent-bar{width:96px;height:10px;border-radius:5px;margin-bottom:32px}
.overlay-copy{position:absolute;left:0;right:0;bottom:0;z-index:2}
.split{position:absolute;inset:0;display:flex;flex-direction:column}
.split-photo{position:relative;flex:1 1 auto;overflow:hidden}
.split-panel{flex:none;position:relative;z-index:2;margin-top:-1px}
.showcase{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:28px;z-index:2}
.showcase .cta{margin-top:0}
.showcase .sub{margin-top:0}
.phone{flex:1 1 0;min-height:0;aspect-ratio:0.49;border-radius:${Math.round(H * 0.035)}px;border:14px solid #111;background:#111;overflow:hidden}
.phone img{width:100%;height:100%;object-fit:cover;object-position:top;display:block}
.shot-missing{height:100%;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;color:#bbb;font-size:28px;background:#222}
</style></head><body><div class="ad">${body}</div></body></html>`;
}
