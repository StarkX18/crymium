import type { FieldSpec, JobContext, ResolvedAnswer } from "./types.js";

export interface QuestionBankRow {
  id: string;
  prompt_display: string;
  match_patterns: string;
  answer: string;
  answer_type: string;
  tags: string;
  max_chars: string;
}

function normalizePrompt(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function matchBankRow(
  promptText: string,
  bank: QuestionBankRow[]
): QuestionBankRow | null {
  const norm = normalizePrompt(promptText);
  for (const row of bank) {
    const patterns = row.match_patterns
      .split("|")
      .map((p) => p.trim())
      .filter(Boolean);
    for (const p of patterns) {
      try {
        if (new RegExp(p, "i").test(norm)) return row;
      } catch {
        if (norm.includes(p.toLowerCase())) return row;
      }
    }
  }
  return null;
}

const FACT_KEYS = new Set([
  "sponsorship_needed",
  "work_auth",
  "city",
  "country",
  "legal_name",
  "email",
  "phone",
  "salary_min",
  "notice_weeks",
  "linkedin",
]);

export function resolveField(
  spec: FieldSpec,
  profile: Record<string, string>,
  bank: QuestionBankRow[],
  ctx: JobContext,
  templates: Map<string, string>
): ResolvedAnswer | null {
  if (spec.type === "fact" || FACT_KEYS.has(spec.answerKey)) {
    const v = profile[spec.answerKey];
    if (v) return { text: v, source: "profile", answerKey: spec.answerKey };
    return null;
  }

  const bankHit = matchBankRow(spec.promptText, bank);
  if (bankHit?.answer) {
    return {
      text: bankHit.answer,
      source: "bank",
      bankId: bankHit.id,
      answerKey: spec.answerKey,
    };
  }

  const templateId =
    spec.answerKey === "why_company" ? "why_company" : spec.tags;
  if (templateId && templates.has(templateId)) {
    let body = templates.get(templateId)!;
    const skills = profile.skills ?? profile.primary_skills ?? "";
    const replacements: Record<string, string> = {
      company: ctx.company,
      role: ctx.role,
      jd_highlight: ctx.jdHighlight ?? "",
      skills,
    };
    for (const [k, v] of Object.entries(replacements)) {
      body = body.replaceAll(`{${k}}`, v);
    }
    return { text: body, source: "template", answerKey: templateId };
  }

  return null;
}

export function suggestBankMerge(
  promptText: string,
  bank: QuestionBankRow[]
): QuestionBankRow[] {
  const norm = normalizePrompt(promptText);
  const tokens = new Set(norm.split(" ").filter((t) => t.length > 3));
  const scored = bank
    .map((row) => {
      const rowNorm = normalizePrompt(row.prompt_display);
      const rowTokens = rowNorm.split(" ").filter((t) => t.length > 3);
      let overlap = 0;
      for (const t of rowTokens) {
        if (tokens.has(t)) overlap++;
      }
      return { row, score: overlap };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return scored.map((s) => s.row);
}

export function draftMatchPattern(promptText: string): string {
  const words = normalizePrompt(promptText)
    .replace(/[^\w\s]/g, "")
    .split(" ")
    .filter((w) => w.length > 3)
    .slice(0, 6);
  if (words.length === 0) return normalizePrompt(promptText).slice(0, 40);
  return words.join(".*");
}
