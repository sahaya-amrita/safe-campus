/** Deterministic gates (before any model call) and post-checks (on any text we return). */

const EMERGENCY =
  /\b(emergency|fire|smoke|flood\w*|earthquake|evacuat\w*|exit|exits|escape|injur\w*|hurt|bleeding|unconscious|faint\w*|ambulance|police|danger\w*|attack\w*|threat\w*|weapon|gas leak|trapped|assembly point|shelter|lockdown|dying|unsafe|chemical|explosion|suicid\w*|overdose|collapsed?)\b|\b(help (me|us|now)|need help|i'?m in danger)\b/i;

/** Registered screen names are not emergencies ("roll call" contains "call"). */
const SCREEN_NAMES =
  /\b(roll[- ]?call|help requests?|hazard review|contacts? (&|and) resources|campus contacts|security office)\b/gi;

export function isEmergencyQuestion(q: string): boolean {
  return EMERGENCY.test(q.replace(SCREEN_NAMES, ' '));
}

const POLITE =
  '(?:(?:hey |hi |ok |okay )?tom[,:]? |please |can you |could you |would you |will you |go ahead and |just |i want you to )*';
const ACTION_REQUEST = new RegExp(
  `^${POLITE}(acknowledge|ack|verify|approve|reject|confirm|mark|send|broadcast|alert|notify|announce|call|phone|dial|text|message|email|contact|dispatch|submit|report|file|log|assign|resolve|close|cancel|delete|dismiss|change|update|edit|raise|stop|block|unblock)\\b`,
  'i',
);
const QUESTION =
  /^(what|what's|how|why|when|who|which|is|are|does|do|did|can i|could i|should i|may i|where|explain|tell me)\b/i;

/** "acknowledge request 12" → true; "how do I acknowledge?" → false. */
export function isActionRequest(q: string): boolean {
  const s = q.trim().toLowerCase();
  return !QUESTION.test(s) && ACTION_REQUEST.test(s);
}

const URL_LIKE = /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(com|org|net|edu|in|io|gov|ac\.in)\b/i;
const PHONE_LIKE = /\+?\d[\d\s-]{6,}\d/g;
const OFFICIAL_INSTRUCTION =
  /\b(evacuate (to|via|through)|evacuation route|assembly point is|exit via|go to the (nearest )?exit|shelter in place|lockdown procedure|leave the building)\b/i;
const CLAIMED_ACTION =
  /\b(i have|i've|i('| a)m|tom has|i just) (acknowledged|sent|notified|alerted|submitted|verified|resolved|dispatched|contacted|called|reported|escalated)\b|\bhelp is on (the|its) way\b|\b(responders?|security|someone) (are|is|will be) (coming|on (the|their) way)\b/i;

/** Returns a reason if text must not be shown; null if it passes. */
export function unsafeTextReason(
  text: string,
  allowedNumbers: readonly string[] = [],
): string | null {
  if (URL_LIKE.test(text)) return 'URL';
  const digits = (s: string) => s.replace(/\D/g, '');
  const allowed = new Set(allowedNumbers.map(digits));
  for (const m of text.match(PHONE_LIKE) ?? [])
    if (!allowed.has(digits(m))) return 'UNVERIFIED_NUMBER';
  if (OFFICIAL_INSTRUCTION.test(text)) return 'OFFICIAL_INSTRUCTION';
  if (CLAIMED_ACTION.test(text)) return 'CLAIMED_ACTION';
  return null;
}
