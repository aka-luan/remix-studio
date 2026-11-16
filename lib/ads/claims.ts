import type { Brand, ConceptDraft } from "./types";

const NUMBER = /\d+(?:[.,]\d+)*/g;

// Word rules match whole words (stems take their full inflection), so the match can be compared with the verified
// facts word for word. JS `\b` is ASCII-only, so boundaries use Unicode letter/number lookarounds.
const W = "(?<![\\p{L}\\p{N}])";
const E = "(?![\\p{L}\\p{N}])";
const words = (body: string) => new RegExp(`${W}(?:${body})${E}`, "giu");

type Rule = { re: RegExp; why: string; check: "symbol" | "words" | "never" };

const RISKY: Rule[] = [
  { re: /%|r\$/giu, why: "mentions a price or percentage", check: "symbol" },
  { re: words("reais"), why: "mentions a price or percentage", check: "words" },
  { re: words("gr[aá]tis|de gra[cç]a|gratuit\\p{L}*|descontos?|promo[cç](?:[aã]o|[oõ]es)|ofertas?|cupom|cupons|off"), why: "mentions a discount or free offer", check: "words" },
  { re: /["“”][^"“”]{8,}["“”]/gu, why: "looks like a testimonial or quote", check: "never" },
  { re: words("depoimentos?|disse(?:ram)?|contou|contaram|segundo (?:a|o) cliente"), why: "looks like a testimonial or quote", check: "never" },
  { re: words("milhares|milh[oõ]es|centenas de (?:clientes|usu[aá]rios|eventos)|mais de \\d+(?:[.,]\\d+)*|n[uú]mero 1|o melhor|a melhor|l[ií]der(?:es)?"), why: "makes a scale or superiority claim", check: "words" },
  { re: words("garantid\\p{L}*|comprovad\\p{L}*|aumenta\\p{L}*|dobr[ae]\\p{L}*|triplic\\p{L}*"), why: "promises a guaranteed or measured result", check: "words" },
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** True when `phrase` appears in `text` as whole words, not inside another word or number. */
const hasWhole = (text: string, phrase: string) => new RegExp(`${W}${escapeRe(phrase)}${E}`, "iu").test(text);

function verifiedMatch(rule: Rule, match: string, verified: string): boolean {
  if (rule.check === "never") return false;
  // Symbols sit right next to digits ("R$49,90", "30%"); the separate number check covers the digits.
  if (rule.check === "symbol") return verified.toLowerCase().includes(match.toLowerCase());
  return hasWhole(verified, match);
}

/**
 * Flags copy that may contain unverified claims. Every match is checked: a number must appear as the same whole
 * number in the verified features/pricing, and a risky phrase must appear there too. Quotes and testimonials are
 * always flagged.
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
    const byReason = new Map<string, Set<string>>();
    for (const rule of RISKY) {
      for (const m of text.matchAll(rule.re)) {
        const match = m[0].trim();
        if (!verifiedMatch(rule, match, verified)) byReason.set(rule.why, (byReason.get(rule.why) ?? new Set()).add(match));
      }
    }
    for (const [why, matches] of byReason) out.push(`${label} ${why} (${[...matches].map((m) => `"${m}"`).join(", ")}). Check it against the verified facts.`);
  }
  return out;
}
