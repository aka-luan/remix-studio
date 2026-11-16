import { GoogleGenAI } from "@google/genai";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { config } from "../config";
import { adsPath } from "./store";
import {
  ConceptBatchSchema,
  ReferenceAnalysisSchema,
  type AdsStatus,
  type Aspect,
  type Brand,
  type ConceptDraft,
  type Reference,
  type ReferenceAnalysis,
} from "./types";

// ---------- Mode ----------

export function adsStatus(): AdsStatus {
  const flag = process.env.ADS_MOCK;
  const textModel = config.geminiTextModel();
  const imageModel = config.geminiImageModel();
  if (flag === "1" || flag === "true") return { mock: true, reason: "ADS_MOCK=1 is set", textModel, imageModel };
  if (!process.env.GEMINI_API_KEY) return { mock: true, reason: "GEMINI_API_KEY is not set", textModel, imageModel };
  return { mock: false, reason: null, textModel, imageModel };
}

// ---------- Gemini plumbing ----------

function client() {
  return new GoogleGenAI({ apiKey: config.geminiApiKey(), httpOptions: { timeout: 5 * 60_000 } });
}

const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

async function imagePart(rel: string) {
  const file = adsPath(rel);
  const mime = MIME[path.extname(rel).toLowerCase()];
  if (!file || !mime) throw new Error(`Unsupported reference image: ${rel}`);
  return { type: "image" as const, mime_type: mime, data: (await readFile(file)).toString("base64") };
}

/** A failure the user should see as-is; retrying won't help. */
export class AiError extends Error {}

function retryable(err: unknown): boolean {
  if (err instanceof AiError) return false;
  const status = (err as { status?: number })?.status;
  if (typeof status === "number") return status === 408 || status === 429 || status >= 500;
  return /fetch failed|ECONNRESET|ETIMEDOUT|socket|network|timeout/i.test(String((err as Error)?.message ?? err));
}

export async function withRetry<T>(label: string, fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!retryable(err) || i === attempts - 1) break;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** i + Math.random() * 500));
    }
  }
  const msg = last instanceof Error ? last.message : String(last);
  const status = (last as { status?: number })?.status;
  if (status === 429) throw new AiError(`${label}: Gemini rate limit or quota reached. Wait a minute and try again. (${msg})`);
  throw new AiError(`${label} failed: ${msg}`);
}

function jsonSchema(schema: z.ZodType) {
  const { $schema: _, ...rest } = z.toJSONSchema(schema) as Record<string, unknown>;
  return rest;
}

type Part = { type: "text"; text: string } | Awaited<ReturnType<typeof imagePart>>;

async function generateJson<S extends z.ZodType>(label: string, system: string, input: Part[], schema: S): Promise<z.infer<S>> {
  return withRetry(label, async () => {
    const interaction = await client().interactions.create(
      {
        model: config.geminiTextModel(),
        system_instruction: system,
        input,
        response_format: { type: "text", mime_type: "application/json", schema: jsonSchema(schema) },
      },
      { maxRetries: 0 },
    );
    let json: unknown;
    try {
      json = JSON.parse(interaction.output_text ?? "");
    } catch {
      throw Object.assign(new Error("Gemini returned unreadable JSON"), { status: 500 });
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw Object.assign(new Error(`Gemini returned incomplete JSON (${parsed.error.issues[0]?.message})`), { status: 500 });
    return parsed.data;
  });
}

// ---------- Shared prompt pieces ----------

function brandFacts(brand: Brand): string {
  return [
    `Produto: ${brand.name} (${brand.website})`,
    `Descrição: ${brand.productDescription}`,
    `Públicos: ${brand.audiences.join("; ")}`,
    `Tom de voz: ${brand.tone}`,
    `Funcionalidades verificadas (as ÚNICAS afirmações permitidas sobre o produto):\n${brand.features.map((f) => `- ${f}`).join("\n")}`,
    brand.pricing ? `Preço verificado: ${brand.pricing}` : "Preço: não informado. Não mencione preço, valores, planos, descontos ou gratuidade.",
  ].join("\n");
}

const CLAIM_RULES = `Regras obrigatórias:
- Escreva todo o texto do anúncio em português do Brasil.
- Use apenas as funcionalidades verificadas. Não invente recursos, integrações, prazos ou garantias.
- Não invente depoimentos, citações de clientes, números de usuários, estatísticas, avaliações, prêmios, descontos ou preços.
- Não afirme que um anúncio de referência "funciona" ou "converte"; trate isso apenas como hipótese.
- Crie ideias originais. Use os insights das referências como princípios, nunca copie layout, frases ou imagens.`;

// ---------- Reference analysis ----------

const ANALYSIS_SYSTEM = `You are a senior performance creative strategist analyzing a screenshot of an ad for a Brazilian SaaS team.
Describe what you see. Write every field in Brazilian Portuguese.
You only see a screenshot: you cannot know reach, spend or results. Never say the ad is successful, proven, winning or high-performing.
"whyItMayWork" is a hypothesis phrased with "pode", "talvez", "provavelmente".
"takeaways" are transferable principles (structure, emotion, framing), not instructions to copy the design or wording.`;

export async function analyzeReference(ref: Reference, brand: Brand): Promise<ReferenceAnalysis> {
  if (adsStatus().mock) return mockAnalysis(ref);
  return generateJson(
    "Reference analysis",
    ANALYSIS_SYSTEM,
    [
      await imagePart(`references/${ref.id}/${ref.imageFile}`),
      {
        type: "text",
        text: `Analise este anúncio. Contexto: vamos usar os aprendizados para anúncios originais do ${brand.name} (${brand.productDescription}).${ref.note ? `\nNota do usuário: ${ref.note}` : ""}`,
      },
    ],
    ReferenceAnalysisSchema,
  );
}

// ---------- Concepts ----------

const CONCEPT_SYSTEM = `You are a senior Meta Ads creative strategist for a Brazilian SaaS. You write static image ad concepts.
Every concept must use a clearly different marketing angle and visual idea.
The final ad is composed in HTML: the headline, supporting copy, logo and CTA are overlaid as real text later, so the image itself must contain no text.
${CLAIM_RULES}
For imagePrompt: write in English, describe a realistic, warm, editorial photo (people, setting, light, lens, mood) for a Brazilian event. Leave clean negative space for overlaid text. Never ask for text, letters, signage, logos, watermarks, phone screens or app UI in the image.`;

export async function generateConcepts(opts: {
  brand: Brand;
  references: Reference[];
  audience: string;
  brief: string;
  count: number;
  avoid: string[];
}): Promise<ConceptDraft[]> {
  if (adsStatus().mock) return mockConcepts(opts.brand, opts.audience, opts.count, opts.avoid);
  const insights = opts.references
    .filter((r) => r.analysis)
    .map((r, i) => `Referência ${i + 1}: gancho: ${r.analysis!.hook}; apelo: ${r.analysis!.emotionalAppeal}; estágio: ${r.analysis!.awarenessStage}; hipótese: ${r.analysis!.whyItMayWork}; princípios: ${r.analysis!.takeaways.join("; ")}`)
    .join("\n");
  const { concepts } = await generateJson(
    "Concept generation",
    CONCEPT_SYSTEM,
    [
      {
        type: "text",
        text: `${brandFacts(opts.brand)}

Público deste projeto: ${opts.audience || "todos os públicos acima"}
${opts.brief ? `Briefing: ${opts.brief}\n` : ""}${insights ? `Insights de anúncios de referência (apenas hipóteses, não copiar):\n${insights}\n` : ""}${opts.avoid.length ? `Ângulos já usados (evite repetir): ${opts.avoid.join(", ")}\n` : ""}
Crie exatamente ${opts.count} conceito(s) distinto(s) de anúncio estático para Meta Ads.`,
      },
    ],
    ConceptBatchSchema,
  );
  if (!concepts.length) throw new AiError("Gemini returned no concepts. Try again.");
  return concepts.slice(0, opts.count);
}

// ---------- Images ----------

export function buildImagePrompt(c: Pick<ConceptDraft, "imagePrompt" | "visualDescription">, brand: Brand, aspect: Aspect, hasRefs: boolean): string {
  return [
    c.imagePrompt.trim() || c.visualDescription,
    `Brand palette to echo subtly in clothing, decor or light: ${Object.values(brand.colors).join(", ")}.`,
    hasRefs ? "The attached images are style and product references only. Do not reproduce any text, interface or logo from them." : "",
    `Photorealistic advertising photograph, ${aspect} frame, natural skin tones, leave generous clean space for headline overlay.`,
    "Absolutely no text, letters, numbers, captions, signage, logos, watermarks, phone screens or app interfaces anywhere in the image.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateImage(opts: { prompt: string; aspect: Aspect; refs: string[]; brand: Brand; seedLabel: string }): Promise<{ data: Buffer; ext: string; mock: boolean }> {
  if (adsStatus().mock) return { data: Buffer.from(mockBackground(opts.brand, opts.aspect, opts.seedLabel)), ext: ".svg", mock: true };
  const refs = await Promise.all(opts.refs.slice(0, 4).map(imagePart));
  return withRetry("Image generation", async () => {
    const interaction = await client().interactions.create(
      {
        model: config.geminiImageModel(),
        input: [{ type: "text", text: opts.prompt }, ...refs],
        response_format: { type: "image", mime_type: "image/jpeg", aspect_ratio: opts.aspect, image_size: "2K" },
      },
      { maxRetries: 0 },
    );
    const data = interaction.output_image?.data;
    // No image usually means a safety block; retrying the same prompt won't fix it.
    if (!data) throw new AiError(`Nano Banana returned no image${interaction.output_text ? `: ${interaction.output_text}` : ". The prompt may have been blocked; edit it and try again."}`);
    return { data: Buffer.from(data, "base64"), ext: ".jpg", mock: false };
  });
}

// ---------- Mocks ----------

function mockAnalysis(ref: Reference): ReferenceAnalysis {
  return {
    hook: "(mock) Uma pergunta direta sobre um momento que o público teme perder.",
    headline: "(mock) Texto principal não lido: configure a chave do Gemini para análise real.",
    composition: "(mock) Foto emocional em tela cheia, título grande no topo, botão no rodapé.",
    emotionalAppeal: "Nostalgia e medo de perder memórias importantes.",
    valueProposition: "Reunir em um só lugar as fotos que os convidados tiraram.",
    cta: "Saiba mais",
    awarenessStage: "problem-aware",
    whyItMayWork: `Hipótese (mock${ref.note ? `, nota: ${ref.note}` : ""}): pode funcionar porque transforma um problema comum em uma imagem emocional fácil de reconhecer.`,
    takeaways: ["Abrir com uma dor reconhecível", "Uma única mensagem por peça", "Rosto humano com emoção real"],
  };
}

const MOCK_CONCEPTS: Omit<ConceptDraft, "audience">[] = [
  {
    title: "As fotos que você não viu",
    angle: "memórias",
    awarenessStage: "problem-aware",
    hook: "Seus convidados tiraram centenas de fotos. Quantas chegaram até você?",
    visualDescription: "Convidados sorrindo enquanto fotografam a pista de dança com o celular, luz quente.",
    imagePrompt: "Candid wedding reception in Brazil at golden hour, guests laughing and taking photos with their phones on the dance floor, warm string lights, shallow depth of field, 35mm editorial photography, empty upper third",
    headline: "Todas as fotos da festa em um só álbum",
    supportingCopy: "Os convidados enviam pelo QR code, sem baixar app.",
    primaryText: "Cada convidado vê a festa de um jeito diferente.\n\nCom o MandaFoto, eles escaneiam um QR code e enviam fotos e vídeos direto para o seu álbum. Sem aplicativo, sem cadastro.",
    cta: "Criar álbum",
    hypothesis: "A dor de perder fotos dos convidados é reconhecível por quem já organizou uma festa e pode gerar identificação imediata.",
    useScreenshot: false,
  },
  {
    title: "Sem app, sem cadastro",
    angle: "praticidade",
    awarenessStage: "solution-aware",
    hook: "Ninguém quer baixar mais um aplicativo no meio da festa.",
    visualDescription: "Mão de convidada apontando o celular para um QR code elegante na mesa do bolo.",
    imagePrompt: "Close-up of an elegant birthday party table with flowers and cake, a woman's hand holding a smartphone, soft natural window light, pastel tones, plenty of empty space at the top, product photography style",
    headline: "Escaneou, enviou. Simples assim.",
    supportingCopy: "Convidados não precisam de app nem de conta.",
    primaryText: "O maior obstáculo para receber as fotos dos convidados é pedir que eles instalem alguma coisa.\n\nNo MandaFoto, basta escanear o QR code.",
    cta: "Saiba mais",
    hypothesis: "Remover a fricção (sem app, sem conta) pode ser o argumento decisivo para quem já conhece soluções parecidas.",
    useScreenshot: true,
  },
  {
    title: "O telão que todo mundo para pra ver",
    angle: "experiência ao vivo",
    awarenessStage: "unaware",
    hook: "E se as fotos dos convidados aparecessem no telão durante a festa?",
    visualDescription: "Convidados se divertindo em frente a um grande telão iluminado em uma festa à noite.",
    imagePrompt: "Night party celebration, group of friends cheering and pointing at a large glowing projection wall out of focus in the background, colorful bokeh, energetic candid moment, cinematic lighting, no readable screen content",
    headline: "As fotos da festa, ao vivo no telão",
    supportingCopy: "Cada foto enviada pode aparecer na hora.",
    primaryText: "Transforme as fotos dos convidados em parte da festa.\n\nCom o telão ao vivo do MandaFoto, as fotos enviadas pelo QR code aparecem durante o evento.",
    cta: "Conhecer o telão",
    hypothesis: "Um recurso visível durante o evento pode atrair quem ainda não pensa no problema das fotos.",
    useScreenshot: false,
  },
  {
    title: "Na manhã seguinte",
    angle: "pós-festa",
    awarenessStage: "problem-aware",
    hook: "A festa acabou. Agora começa a caça às fotos nos grupos de WhatsApp.",
    visualDescription: "Casal relaxado no sofá na manhã seguinte ao casamento, revendo memórias juntos.",
    imagePrompt: "Newlywed couple relaxing on a sofa the morning after their wedding, wrapped in a blanket, soft morning light through linen curtains, intimate candid moment, warm film photography look, negative space on the left",
    headline: "Acorde com todas as fotos já reunidas",
    supportingCopy: "Uma galeria compartilhada com as fotos de todos.",
    primaryText: "Em vez de pedir foto por foto depois do evento, deixe que os convidados enviem durante a festa.\n\nTudo fica em uma galeria compartilhada.",
    cta: "Criar álbum",
    hypothesis: "Mostrar o momento depois da festa pode tornar concreta a dor de juntar fotos espalhadas.",
    useScreenshot: true,
  },
  {
    title: "Olhar de cada convidado",
    angle: "pontos de vista",
    awarenessStage: "unaware",
    hook: "Você só vai ver a sua festa por um ângulo. Seus convidados viram todos os outros.",
    visualDescription: "Aniversariante soprando velas, vários convidados fotografando de ângulos diferentes.",
    imagePrompt: "Birthday celebration, woman blowing out candles on a cake surrounded by friends holding up phones from different angles, warm candlelight, joyful candid expressions, documentary photography, clean dark space above",
    headline: "Sua festa vista por todos os ângulos",
    supportingCopy: "Fotos e vídeos dos convidados no seu álbum.",
    primaryText: "Os melhores momentos muitas vezes acontecem longe do fotógrafo.\n\nCom um QR code, cada convidado pode enviar o que registrou.",
    cta: "Saiba mais",
    hypothesis: "O ângulo emocional de 'momentos que você não viu' pode despertar curiosidade em quem não está procurando uma solução.",
    useScreenshot: false,
  },
  {
    title: "O QR code na mesa",
    angle: "como funciona",
    awarenessStage: "product-aware",
    hook: "Três passos: crie o álbum, coloque o QR code na mesa, receba as fotos.",
    visualDescription: "Mesa de recepção decorada com plaquinha elegante, convidados ao fundo.",
    imagePrompt: "Elegant wedding welcome table with flowers, candles and a small blank acrylic stand, guests mingling softly out of focus in the background, airy daylight, neutral palette, minimal composition with wide empty space",
    headline: "Crie o álbum. Mostre o QR code. Pronto.",
    supportingCopy: "Os convidados enviam fotos e vídeos sem cadastro.",
    primaryText: "Funciona assim: você cria o álbum, coloca o QR code nas mesas e os convidados enviam as fotos e vídeos direto do celular.\n\nSem aplicativo, sem conta.",
    cta: "Começar agora",
    hypothesis: "Para quem já está comparando opções, explicar o passo a passo pode reduzir a dúvida sobre como funciona.",
    useScreenshot: true,
  },
];

function mockConcepts(brand: Brand, audience: string, count: number, avoid: string[]): ConceptDraft[] {
  const fresh = MOCK_CONCEPTS.filter((c) => !avoid.includes(c.angle));
  const pool = fresh.length >= count ? fresh : MOCK_CONCEPTS;
  return pool.slice(0, count).map((c, i) => ({ ...c, audience: audience || brand.audiences[i % brand.audiences.length] || "" }));
}

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** A placeholder "photo": a soft gradient with bokeh circles in brand colors. */
function mockBackground(brand: Brand, aspect: Aspect, seed: string): string {
  const [w, h] = aspect === "4:5" ? [1080, 1350] : aspect === "9:16" ? [1080, 1920] : [1080, 1080];
  let r = hash(seed);
  const rand = () => ((r = Math.imul(r ^ (r >>> 15), 2246822507) >>> 0) % 10000) / 10000;
  const { primary, secondary, accent } = brand.colors;
  const dots = Array.from({ length: 26 }, () => {
    const color = [primary, accent, "#ffffff"][Math.floor(rand() * 3)];
    return `<circle cx="${(rand() * w).toFixed(0)}" cy="${(rand() * h).toFixed(0)}" r="${(20 + rand() * 140).toFixed(0)}" fill="${color}" opacity="${(0.08 + rand() * 0.3).toFixed(2)}"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${secondary}"/><stop offset="0.55" stop-color="${primary}"/><stop offset="1" stop-color="${accent}"/></linearGradient>
<filter id="b"><feGaussianBlur stdDeviation="18"/></filter></defs>
<rect width="100%" height="100%" fill="url(#g)"/><g filter="url(#b)">${dots}</g>
<text x="${w / 2}" y="${h - 40}" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#ffffff" opacity="0.45">MOCK IMAGE · ${aspect}</text>
</svg>`;
}
