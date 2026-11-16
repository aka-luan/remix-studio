import { z } from "zod";

// ---------- Brand profile ----------

export type AssetKind = "logo" | "screenshot" | "photo" | "font";

export type BrandAsset = { file: string; kind: AssetKind; label: string; addedAt: string };

export type Brand = {
  name: string;
  website: string;
  productDescription: string;
  audiences: string[];
  language: string;
  tone: string;
  /** Only claims listed here may appear in ad copy. */
  features: string[];
  /** Verified pricing text. Empty means pricing is never mentioned. */
  pricing: string;
  colors: { primary: string; secondary: string; accent: string; background: string; text: string };
  fonts: { heading: string; body: string };
  logoFile: string | null;
  assets: BrandAsset[];
  updatedAt: string;
};

// ---------- Competitor references ----------

export const ReferenceAnalysisSchema = z.object({
  hook: z.string().describe("The first thing that grabs attention, in Portuguese"),
  headline: z.string().describe("Main headline as written in the ad, verbatim, or empty"),
  composition: z.string().describe("Layout, subject, framing, colors, typography placement"),
  emotionalAppeal: z.string(),
  valueProposition: z.string(),
  cta: z.string().describe("Call to action, verbatim, or empty"),
  awarenessStage: z.enum(["unaware", "problem-aware", "solution-aware", "product-aware", "most-aware"]),
  whyItMayWork: z.string().describe("A hypothesis about why it may work. Never claims it performs well."),
  takeaways: z.array(z.string()).describe("Principles to borrow without copying the design"),
});
export type ReferenceAnalysis = z.infer<typeof ReferenceAnalysisSchema>;

export type Reference = {
  id: string;
  createdAt: string;
  imageFile: string;
  note: string;
  analysis: ReferenceAnalysis | null;
  analyzedWithMock?: boolean;
  error?: string;
};

// ---------- Concepts ----------

export const ConceptDraftSchema = z.object({
  title: z.string().describe("Short creative title, Portuguese"),
  angle: z.string().describe("Marketing angle in 1-3 words, Portuguese, e.g. 'memórias', 'praticidade'"),
  audience: z.string().describe("One of the brand's target audiences"),
  awarenessStage: z.enum(["unaware", "problem-aware", "solution-aware", "product-aware", "most-aware"]),
  hook: z.string().describe("Main hook, Portuguese"),
  visualDescription: z.string().describe("What the image shows, Portuguese"),
  imagePrompt: z.string().describe("English prompt for a photo background. No text, letters, logos, phone screens or UI."),
  headline: z.string().describe("On-image headline, max ~8 words, Portuguese"),
  supportingCopy: z.string().describe("One short on-image line under the headline, Portuguese"),
  primaryText: z.string().describe("Meta primary text above the ad, Portuguese, 1-3 short paragraphs"),
  cta: z.string().describe("Button label, Portuguese, max 3 words"),
  hypothesis: z.string().describe("What this concept tests and why it might work, Portuguese"),
  useScreenshot: z.boolean().describe("Whether a real product screenshot should appear in the composition"),
});
export type ConceptDraft = z.infer<typeof ConceptDraftSchema>;

export const ConceptBatchSchema = z.object({ concepts: z.array(ConceptDraftSchema) });

export const ASPECTS = ["4:5", "9:16", "1:1"] as const;
export type Aspect = (typeof ASPECTS)[number];

export type ImageVersion = {
  id: string;
  n: number;
  file: string;
  prompt: string;
  aspect: Aspect;
  createdAt: string;
  mock: boolean;
};

export const TEMPLATES = [
  { id: "overlay", label: "Full-bleed photo" },
  { id: "split", label: "Photo + color panel" },
  { id: "showcase", label: "Product screenshot" },
] as const;
export type TemplateId = (typeof TEMPLATES)[number]["id"];

export const FORMATS = [
  { id: "feed", label: "Feed 4:5", width: 1080, height: 1350, aspect: "4:5" },
  { id: "story", label: "Stories 9:16", width: 1080, height: 1920, aspect: "9:16" },
  { id: "square", label: "Square 1:1", width: 1080, height: 1080, aspect: "1:1" },
] as const;
export type FormatId = (typeof FORMATS)[number]["id"];

export type Layout = {
  template: TemplateId;
  logo: "top-left" | "top-center" | "top-right" | "bottom" | "none";
  screenshotFile: string | null;
  ctaStyle: "solid" | "outline" | "pill";
  scrim: number; // 0-100, darkness over the photo
};

export type Concept = ConceptDraft & {
  id: string;
  status: "draft" | "approved";
  createdAt: string;
  mock: boolean;
  /** Brand assets sent to the image model as visual references. */
  imageRefs: string[];
  versions: ImageVersion[];
  selectedVersionId: string | null;
  layout: Layout;
};

export type ExportRecord = {
  id: string;
  conceptId: string;
  versionId: string | null;
  variant: string;
  format: FormatId;
  file: string;
  metaFile: string;
  createdAt: string;
};

export type Project = {
  id: string;
  name: string;
  createdAt: string;
  audience: string;
  brief: string;
  referenceIds: string[];
  conceptSeq: number;
  concepts: Concept[];
  exports: ExportRecord[];
};

export type ExportMetadata = {
  conceptId: string;
  projectId: string;
  projectName: string;
  variant: string;
  format: { id: FormatId; width: number; height: number; placement: string };
  title: string;
  angle: string;
  audience: string;
  awarenessStage: string;
  copy: { hook: string; headline: string; supportingCopy: string; primaryText: string; cta: string };
  hypothesis: string;
  template: TemplateId;
  image: { versionId: string | null; prompt: string | null; mock: boolean; model: string | null };
  language: string;
  exportedAt: string;
};

export type LibraryItem = ExportRecord & { projectId: string; projectName: string; title: string; angle: string; audience: string; headline: string };

export type AdsStatus = { mock: boolean; reason: string | null; textModel: string; imageModel: string };

export const PLACEMENTS: Record<FormatId, string> = {
  feed: "Instagram/Facebook Feed",
  story: "Instagram/Facebook Stories & Reels",
  square: "Square placements",
};
