export type SessionClass =
  | "persistent"
  | "sliding"
  | "login_required"
  | "sso_external"
  | "mfa_each_time"
  | "anonymous_ok";

export type JobStatus =
  | "discovered"
  | "queued"
  | "scheduled"
  | "running"
  | "rate_limited"
  | "needs_human"
  | "applied"
  | "failed"
  | "skipped"
  | "blocked_auth";

export type AnswerType = "fact" | "narrative" | "enum";

export type AnswerSource =
  | "profile"
  | "bank"
  | "template"
  | "job_cache"
  | "manual"
  | "llm";

export interface ResolvedAnswer {
  text: string;
  source: AnswerSource;
  answerKey?: string;
  bankId?: string;
}

export interface FieldSpec {
  answerKey: string;
  type: AnswerType;
  promptText: string;
  maxLength?: number;
  options?: string[];
  tags?: string;
}

export interface JobContext {
  company: string;
  role: string;
  jobUrl: string;
  jdHighlight?: string;
  portalId: string;
}

export interface AppSettings {
  spreadsheetId: string;
  googleClientId: string;
  googleClientSecret: string;
  llmEnabled: boolean;
}
