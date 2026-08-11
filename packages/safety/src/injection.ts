/**
 * injection.ts — prompt-injection detection for the free-text field.
 *
 * The name field is handled by an allowlist (sanitize.ts) and needs nothing else. The
 * "hikaye fikri" field is prose, so it gets this instead: a pattern set for the shapes an
 * instruction takes, in Turkish and in English, plus the structural markers of a
 * serialisation or role boundary.
 *
 * ⚠️ This is a SIGNAL, not the defence. Pattern matching on prose is inherently leaky, and
 * a detector treated as the wall would be a bad wall. The actual containment is layer K3
 * (spotlight.ts — the text is never concatenated into the system prompt) and layer K4a (the
 * canary check — if the system prompt ever leaks into the output, we find out). What this
 * file buys is the ability to REFUSE the obvious ones for free and to record the rest, so
 * an account probing us repeatedly becomes visible instead of invisible.
 */

import type { ErrorCode } from '@kendihikayem/contract';
import { toLowerTr } from '@kendihikayem/shared';

import { SAFETY_MESSAGES_TR } from './messages.tr';
import { type SafetyDecision, type SafetyViolation, decide, excerptOf } from './types';

interface InjectionPattern {
  id: string;
  pattern: RegExp;
  /** `block` refuses the request; `flag` records it and lets the story continue. */
  severity: 'flag' | 'block';
}

/**
 * Turkish first — an attacker writing to a Turkish product writes in Turkish, and every
 * English-only detector in the wild misses exactly that.
 *
 * ⚠️ Patterns are matched against the TURKISH-lowercased text, so they are written in
 * lowercase and never use `\w`: JavaScript's `\w` is `[A-Za-z0-9_]`, which matches neither
 * `ı` nor `ş`, and a rule written with it silently stops working on the first suffixed
 * Turkish word — the exact words these rules are about.
 */
const TR = 'a-zçğıöşü';

const PATTERNS: readonly InjectionPattern[] = [
  // ── explicit instruction override ───────────────────────────────────────
  {
    id: 'tr.ignore_previous',
    pattern: new RegExp(
      `(önceki|yukarıdaki|bütün|tüm|bu)(\\s+[${TR}]+){0,2}\\s+(talimat|komut|kural|yönerge)[${TR}]*\\s*(yok\\s*say|unut|görmezden\\s*gel|dikkate\\s*alma|iptal\\s*et)`,
      'u',
    ),
    severity: 'block',
  },
  {
    id: 'en.ignore_previous',
    pattern: /(ignore|disregard|forget|override)\s+(all\s+|the\s+|any\s+)?(previous|prior|above|earlier)\s+(instruction|prompt|rule|direction)/iu,
    severity: 'block',
  },
  // ── system-prompt exfiltration ──────────────────────────────────────────
  {
    id: 'tr.reveal_system_prompt',
    pattern: new RegExp(
      `(sistem|system)\\s*(prompt|promptu|promptunu|mesajı|talimat[${TR}]*)(\\s+[${TR}]+){0,2}\\s*(nedir|yazdır|göster|paylaş|söyle|ver)`,
      'u',
    ),
    severity: 'block',
  },
  {
    id: 'en.reveal_system_prompt',
    pattern: /(reveal|print|show|repeat|output|dump)\s+(your\s+|the\s+)?(system\s+)?(prompt|instructions|rules)/iu,
    severity: 'block',
  },
  // ── role / persona hijack ───────────────────────────────────────────────
  {
    id: 'tr.role_hijack',
    pattern: new RegExp(`(sen\\s+artık|bundan\\s+sonra\\s+sen|rolün|kimliğin)\\s+[${TR}]+`, 'u'),
    severity: 'block',
  },
  {
    id: 'en.role_hijack',
    pattern: /\b(you\s+are\s+now|act\s+as|pretend\s+to\s+be|from\s+now\s+on\s+you)\b/iu,
    severity: 'block',
  },
  {
    id: 'en.jailbreak_named',
    pattern: /\b(jailbreak|do\s+anything\s+now|developer\s+mode|dan\s+mode)\b/iu,
    severity: 'block',
  },
  // ── structural boundary spoofing ────────────────────────────────────────
  {
    id: 'struct.role_marker',
    pattern: /^\s*(system|assistant|user|ebeveyn_girdisi)\s*:/imu,
    severity: 'block',
  },
  {
    id: 'struct.chat_template',
    pattern: /<\|[a-z_]+\|>|\[\/?INST\]|<\/?(system|assistant|user|ebeveyn_girdisi)>/iu,
    severity: 'block',
  },
  {
    id: 'struct.markup',
    // Angle brackets, template braces and code fences have no business in "hikaye fikri".
    pattern: /<[a-z/][^>]*>|\{\{.+?\}\}|```/iu,
    severity: 'flag',
  },
  // ── safety-rule negotiation ─────────────────────────────────────────────
  {
    id: 'tr.disable_safety',
    pattern: new RegExp(
      `(güvenlik|filtre|kısıtlama|sansür)[${TR}]*(\\s+[${TR}]+){0,2}\\s+(kapat|devre\\s*dışı|kaldır|yok\\s*say)`,
      'u',
    ),
    severity: 'block',
  },
  {
    id: 'tr.no_restrictions',
    pattern: new RegExp(`(kısıtlama|sınır)[${TR}]*\\s*(olmadan|olmaksızın)|hiçbir\\s+kurala\\s+uyma`, 'u'),
    severity: 'block',
  },
];

const INJECTION_ERROR_CODE: ErrorCode = 'INJECTION_DETECTED';

/**
 * Scans one free-text field. Returns `pass` for ordinary parent input — which is what the
 * overwhelming majority of it is, and the reason none of these patterns match plain prose
 * about dinosaurs or a first day at school.
 */
export function detectInjection(text: string): SafetyDecision {
  const violations: SafetyViolation[] = [];
  // Turkish-correct lowercasing, not `toLowerCase()`: the latter turns "İ" into "i" plus a
  // combining dot and "I" into "i" rather than "ı", which breaks every pattern below.
  // Both mappings are one character for one, so `match.index` still points into `text`.
  const haystack = toLowerTr(text);

  for (const rule of PATTERNS) {
    const match = rule.pattern.exec(haystack);
    if (!match) continue;
    violations.push({
      code: 'INJECTION_PATTERN',
      engine: 'injection_detector',
      severity: rule.severity,
      messageTr: SAFETY_MESSAGES_TR.INJECTION_PATTERN,
      detail: rule.id,
      excerpt: excerptOf(text, match.index),
    });
  }

  return decide(violations, () => INJECTION_ERROR_CODE);
}

/** Test/ops helper: the rule ids, so a regression suite can name what it is asserting. */
export function injectionRuleIds(): string[] {
  return PATTERNS.map((rule) => rule.id);
}
