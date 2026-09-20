/** Tab names and header rows for the Huntboard spreadsheet */

export const TABS = {
  profile: "Profile",
  templates: "Templates",
  questionBank: "QuestionBank",
  portals: "Portals",
  jobs: "Jobs",
  captureLog: "CaptureLog",
} as const;

export const HEADERS: Record<string, string[]> = {
  [TABS.profile]: ["key", "value", "updated_at"],
  [TABS.templates]: [
    "template_id",
    "name",
    "body",
    "slots",
    "version",
    "updated_at",
  ],
  [TABS.questionBank]: [
    "id",
    "prompt_display",
    "match_patterns",
    "answer",
    "answer_type",
    "tags",
    "max_chars",
    "source",
    "last_used_at",
  ],
  [TABS.portals]: [
    "portal_id",
    "base_url",
    "probe_url",
    "session_class",
    "adapter",
    "schedule_cron",
    "schedule_enabled",
    "last_probe_at",
    "last_probe_result",
  ],
  [TABS.jobs]: [
    "job_id",
    "portal_id",
    "title",
    "job_url",
    "status",
    "scheduled_for",
    "retry_after",
    "last_error",
    "attempt_count",
    "updated_at",
  ],
  [TABS.captureLog]: [
    "time",
    "portal_id",
    "prompt",
    "bank_id",
    "action",
    "pattern_added",
  ],
};

export const DEFAULT_PROFILE: Record<string, string> = {
  legal_name: "",
  email: "",
  phone: "",
  city: "",
  country: "",
  work_auth: "",
  sponsorship_needed: "no",
  salary_min: "",
  notice_weeks: "",
  linkedin: "",
};

export const DEFAULT_TEMPLATES: Array<Record<string, string>> = [
  {
    template_id: "why_company",
    name: "Why join this company",
    body:
      "I am excited about the {role} role at {company}. " +
      "{jd_highlight}\n\n" +
      "My background in {skills} aligns with what you are building. " +
      "I would welcome the chance to contribute.",
    slots: "company,role,jd_highlight,skills",
    version: "1",
    updated_at: "",
  },
];
