import type { Brand, ConceptDraft } from "./types";

const RISKY: { re: RegExp; why: string }[] = [
  { re: /\d/, why: "contains a number" },
  { re: /%|r\$|reais/i, why: "mentions a price or percentage" },
  { re: /gr[aá]tis|de gra[cç]a|gratuito|desconto|promo[cç][aã]o|oferta|cupom|off\b/i, why: "mentions a discount or free offer" },
  { re: /["“”].{8,}["“”]|depoimento|disse|segundo (a|o) cliente/i, why: "looks like a testimonial or quote" },
  { re: /\b(milhares|milh[oõ]es|centenas de (clientes|usu[aá]rios|eventos)|mais de \d|n[uú]mero 1|o melhor|l[ií]der)\b/i, why: "makes a scale or superiority claim" },
  { re: /\b(garantid[oa]|comprovad[oa]|aumenta|dobr[ae]|triplic)/i, why: "promises a guaranteed or measured result" },
];

/** Flags copy that may contain unverified claims. Text found in the brand's verified facts is allowed. */
export function claimWarnings(concept: Pick<ConceptDraft, "hook" | "headline" | "supportingCopy" | "primaryText" | "cta">, brand: Pick<Brand, "features" | "pricing">): string[] {
  const verified = [...brand.features, brand.pricing].join(" ").toLowerCase();
  const fields: [string, string][] = [
    ["Hook", concept.hook],
    ["Headline", concept.headline],
    ["Supporting copy", concept.supportingCopy],
    ["Primary text", concept.primaryText],
    ["CTA", concept.cta],
  ];
  const out: string[] = [];
  for (const [label, text] of fields) {
    for (const { re, why } of RISKY) {
      const m = text.match(re);
      if (!m) continue;
      // Numbers that appear in verified pricing/features are fine.
      if (verified && verified.includes(m[0].toLowerCase()) && !/depoimento|"/.test(m[0])) continue;
      out.push(`${label} ${why} ("${m[0].trim()}"). Check it against the verified facts.`);
    }
  }
  return out;
}
