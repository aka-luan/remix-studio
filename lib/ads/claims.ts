import type { Brand, ConceptDraft } from "./types";

const NUMBER = /\d+(?:[.,]\d+)*/g;

const RISKY: { re: RegExp; why: string; allowIfVerified: boolean }[] = [
  { re: /%|r\$|\breais\b/gi, why: "mentions a price or percentage", allowIfVerified: true },
  { re: /gr[aá]tis|de gra[cç]a|gratuit[oa]|desconto|promo[cç][aã]o|oferta|cupom|\boff\b/gi, why: "mentions a discount or free offer", allowIfVerified: true },
  { re: /["“”][^"“”]{8,}["“”]|depoimento|segundo (?:a|o) cliente/gi, why: "looks like a testimonial or quote", allowIfVerified: false },
  { re: /\b(?:milhares|milh[oõ]es|centenas de (?:clientes|usu[aá]rios|eventos)|mais de \d|n[uú]mero 1|o melhor|l[ií]der)/gi, why: "makes a scale or superiority claim", allowIfVerified: true },
  { re: /\b(?:garantid[oa]|comprovad[oa]|aumenta|dobr[ae]|triplic)/gi, why: "promises a guaranteed or measured result", allowIfVerified: true },
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** True when `phrase` appears in `text` as whole words, not inside another word or number. */
const hasWhole = (text: string, phrase: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(phrase)}(?![\\p{L}\\p{N}])`, "iu").test(text);

/**
 * Flags copy that may contain unverified claims. Every match is checked: a number must appear as the same whole
 * number in the verified features/pricing, and a risky phrase must appear there as whole words.
 */
export function claimWarnings(concept: Pick<ConceptDraft, "hook" | "headline" | "supportingCopy" | "primaryText" | "cta">, brand: Pick<Brand, "features" | "pricing">): string[] {
  const verified = [...brand.features, brand.pricing].join("\n");
  const verifiedNumbers = new Set(verified.match(NUMBER) ?? []);
  const fields: [string, string][] = [
    ["Hook", concept.hook],
    ["Headline", concept.headline],
    ["Supporting copy", concept.supportingCopy],
    ["Primary text", concept.primaryText],
    ["CTA", concept.cta],
  ];
  const out: string[] = [];
  for (const [label, text] of fields) {
    const numbers = [...new Set(text.match(NUMBER) ?? [])].filter((n) => !verifiedNumbers.has(n));
    if (numbers.length) out.push(`${label} contains a number that isn't in the verified facts (${numbers.join(", ")}).`);
    for (const { re, why, allowIfVerified } of RISKY) {
      const unverified = [...new Set([...text.matchAll(re)].map((m) => m[0].trim()))].filter((m) => !allowIfVerified || !hasWhole(verified, m));
      if (unverified.length) out.push(`${label} ${why} (${unverified.map((m) => `"${m}"`).join(", ")}). Check it against the verified facts.`);
    }
  }
  return out;
}
