/**
 * Every Tom UI string, in the same flat, typed shape as the shared student
 * i18n `Messages` interface (apps/web/src/i18n, owned by Claude Code 1).
 * Once that integration contract is confirmed, the shell can pass translated
 * messages through the `messages` prop. Until then Tom uses English only.
 * Tamil copy must be reviewed by a fluent speaker before LIVE use.
 */
export interface TomMessages {
  launcherOpen: string;
  launcherClose: string;
  restoreLauncher: string;
  panelTitle: string;
  closePanel: string;
  scope: string;
  draftNotice: (mode: string) => string;
  tourHeading: (step: number, total: number, title: string) => string;
  tourBack: string;
  tourNext: string;
  tourFinish: string;
  tourExit: string;
  tourStart: (steps: number) => string;
  tipsHeading: string;
  noTips: string;
  dismissTip: (title: string) => string;
  dismissTipButton: string;
  showDismissedTips: string;
  faqHeading: string;
  noFaqs: string;
  askLabel: string;
  askButton: string;
  officialHeading: string;
  noInstructions: string;
  instructionMeta: (source: string, version: string, language: string) => string;
  emergencyRefusal: string;
  emergencyFollowProcedures: string;
  emergencyStudentNav: string;
  contactsHeading: string;
  contactUnconfirmed: string;
  unknownAnswer: string;
  matchIntro: string;
  draftEntry: string;
  explainButton: string;
  explaining: string;
  aiCaptionMock: string;
  aiCaptionLive: string;
  aiUnavailable: string;
  minimise: string;
  // onboarding
  welcomeTitle: string;
  welcomeBody: string;
  welcomeTour: string;
  welcomeLater: string;
  // keyboard shortcut
  shortcutToggle: string;
  shortcutHint: string;
  // tours
  tourProgress: (step: number, total: number) => string;
  tourSkip: string;
  tourTargetMissing: string;
  tourOpening: (label: string) => string;
  tourOpened: (label: string) => string;
  tourCannotOpen: (label: string) => string;
  tourUnavailable: string;
  tourEnded: string;
  // assistant
  threadLabel: string;
  prototypeNotice: string;
  prototypeNoticeAi: string;
  you: string;
  suggestionsLabel: string;
  navTaking: (label: string, description: string) => string;
  navDone: (label: string) => string;
  navNotPermitted: (label: string) => string;
  navUnavailable: (label: string) => string;
  navFailed: (label: string) => string;
  navAlreadyHere: (label: string, description: string) => string;
  navSuggest: (label: string, description: string) => string;
  navGoButton: (label: string) => string;
  backDone: string;
  backUnavailable: string;
  screenIntro: (label: string | null, description: string | null) => string;
  tourOffer: (title: string, steps: number) => string;
  tourStartButton: string;
  noTour: string;
  instructionsIntro: string;
  ambiguous: string;
  unknownSuggest: string;
  refuse: (action: string) => string;
  refuseWhere: (label: string) => string;
  sourceLink: string;
  thinking: string;
  aiAnswerLabel: (provider: string, model: string | null) => string;
  mockAnswerLabel: string;
  rulesAnswerLabel: string;
  fallbackLabel: (reason: string) => string;
  fallbackReasons: Record<
    | "PROVIDER_DISABLED"
    | "PROVIDER_UNCONFIGURED"
    | "MODEL_UNAVAILABLE"
    | "TIMEOUT"
    | "RATE_LIMITED"
    | "REFUSED"
    | "TRUNCATED"
    | "INVALID_OUTPUT"
    | "UNAVAILABLE",
    string
  >;
  aiServiceUnavailable: (reason: string) => string;
  aiUnreachable: string;
  aiSignedOut: string;
  aiRateLimited: (retryAfter: number | null) => string;
  aiInvalid: string;
  basedOn: string;
  refMeta: (source: string, version: string) => string;
  draftRef: string;
  openInstructions: (title: string) => string;
}

export const TOM_MESSAGES_EN: TomMessages = {
  launcherOpen: "Help (Tom)",
  launcherClose: "Close Tom",
  restoreLauncher: "Show Tom help",
  panelTitle: "Tom — app help",
  closePanel: "Close Tom help panel",
  scope:
    "Tom explains how to use this app. Tom cannot send alerts, contact anyone, take actions for you, or give emergency instructions.",
  draftNotice: (mode) => `${mode} mode: some help text below is a prototype draft that has not been reviewed.`,
  tourHeading: (step, total, title) => `Tour step ${step} of ${total}: ${title}`,
  tourBack: "Back",
  tourNext: "Next",
  tourFinish: "Finish tour",
  tourExit: "Exit tour",
  tourStart: (steps) => `Take the tour (${steps} steps)`,
  tipsHeading: "Tips for this screen",
  noTips: "No tips to show here.",
  dismissTip: (title) => `Dismiss tip: ${title}`,
  dismissTipButton: "Dismiss",
  showDismissedTips: "Show dismissed tips",
  faqHeading: "Common questions",
  noFaqs: "No reviewed questions are available for this screen.",
  askLabel: "Ask Tom about this app",
  askButton: "Ask",
  officialHeading: "Official instructions",
  noInstructions:
    "No approved instruction pack is configured in this app. Follow your campus's official emergency procedures.",
  instructionMeta: (source, version, language) => `(${source}, version ${version}, ${language})`,
  emergencyRefusal: "I can't give emergency instructions, routes or contacts.",
  emergencyFollowProcedures: "If you or someone else is in danger, follow your campus's official emergency procedures.",
  emergencyStudentNav:
    "In this app you can use the “I Need Help” check-in. Its screen shows whether it was actually received; it is not a guarantee that someone will respond.",
  contactsHeading: "Campus contacts on record",
  contactUnconfirmed: "not yet confirmed by the institution",
  unknownAnswer:
    "I don't know the answer to that. I only have help about using this screen. For anything else, ask your campus team or follow official procedures.",
  matchIntro: "This might help:",
  draftEntry: "Draft help text (not yet reviewed).",
  explainButton: "Explain in simpler words",
  explaining: "Explaining…",
  aiCaptionMock: "Simulated (mock) explanation of the help text above — not an official instruction.",
  aiCaptionLive: "AI-generated explanation of the help text above — not an official instruction.",
  aiUnavailable: "Explanation unavailable. The help text above is unchanged.",
  minimise: "Minimise Tom for this session",
  welcomeTitle: "Hi, I'm Tom",
  welcomeBody: "I can show you around this workspace, take you to a section, or explain what's on screen.",
  welcomeTour: "Take a tour",
  welcomeLater: "Not now",
  shortcutToggle: "Open Tom with the ? key",
  shortcutHint: "Press ? (when you're not typing) to open Tom.",
  tourProgress: (step, total) => `Step ${step} of ${total}`,
  tourSkip: "Skip tour",
  tourTargetMissing: "This part of the screen isn't showing right now. You can continue the tour.",
  tourOpening: (label) => `Opening ${label}…`,
  tourOpened: (label) => `Now showing ${label}.`,
  tourCannotOpen: (label) => `I couldn't open ${label}. Your account may not have access to it.`,
  tourUnavailable: "There's no tour for this screen yet.",
  tourEnded: "Tour ended.",
  threadLabel: "Conversation with Tom",
  prototypeNotice:
    "Functional prototype: Tom matches your words to a fixed list of app help, sections and tours. It is not an AI model.",
  prototypeNoticeAi:
    "Tom answers open questions with a hosted AI model, grounded in SAFE CAMPUS help and checked by the server. Every answer says whether it came from AI or built-in help. Emergencies and requests to take actions are always handled by fixed rules and never sent to the AI.",
  you: "You",
  suggestionsLabel: "Try asking",
  navTaking: (label, description) => `Taking you to ${label}. ${description}`,
  navDone: (label) => `You're on ${label} now.`,
  navNotPermitted: (label) => `I can't take you to ${label}: your account doesn't have access. Nothing changed.`,
  navUnavailable: (label) => `${label} isn't available from here. Nothing changed.`,
  navFailed: (label) => `Opening ${label} didn't work. Nothing changed.`,
  navAlreadyHere: (label, description) => `You're already on ${label}. ${description}`,
  navSuggest: (label, description) => `${label}: ${description} Want me to take you there?`,
  navGoButton: (label) => `Go to ${label}`,
  backDone: "Back to the previous section.",
  backUnavailable: "There's no previous section to go back to.",
  screenIntro: (label, description) =>
    label ? `You're on ${label}. ${description ?? ""}` : "Here's help for this screen.",
  tourOffer: (title, steps) => `The ${title} has ${steps} steps. You can stop it any time with Skip tour or Escape.`,
  tourStartButton: "Start the tour",
  noTour: "There's no tour for this screen yet.",
  instructionsIntro: "Official instructions come only from approved instruction packs.",
  ambiguous: "Which one did you mean?",
  unknownSuggest:
    "I don't know how to help with that. I can explain this screen, take you to a section, or start a tour.",
  refuse: (action) => `I can't ${action} for you. Tom never takes actions on your behalf.`,
  refuseWhere: (label) => `You can do it yourself in ${label}.`,
  sourceLink: "source",
  thinking: "Tom is thinking…",
  aiAnswerLabel: (provider, model) =>
    `AI answer (${provider}${model ? ` · ${model}` : ""}) based on SAFE CAMPUS help. Not an official instruction.`,
  mockAnswerLabel: "Simulated (mock) answer for development. Not a real AI model and not an official instruction.",
  rulesAnswerLabel: "Answer from Tom's fixed safety rules.",
  fallbackLabel: (reason) => `AI unavailable (${reason}). Answer from Tom's built-in help.`,
  fallbackReasons: {
    PROVIDER_DISABLED: "AI is switched off on this server",
    PROVIDER_UNCONFIGURED: "the AI provider isn't configured",
    MODEL_UNAVAILABLE: "the configured AI model isn't available",
    TIMEOUT: "the AI took too long",
    RATE_LIMITED: "the AI usage limit was reached",
    REFUSED: "the AI declined",
    TRUNCATED: "the AI answer was cut off",
    INVALID_OUTPUT: "the AI answer failed safety checks",
    UNAVAILABLE: "the AI service is unavailable",
  },
  aiServiceUnavailable: (reason) => `The AI assistant is unavailable (${reason}). Here's Tom's built-in help instead.`,
  aiUnreachable: "Couldn't reach the AI assistant. Here's Tom's built-in help instead.",
  aiSignedOut: "Sign in to use the AI assistant. Here's Tom's built-in help instead.",
  aiRateLimited: (retryAfter) =>
    `You've asked a lot of questions quickly${retryAfter ? `; try again in ${retryAfter} seconds` : ""}. Here's Tom's built-in help instead.`,
  aiInvalid: "The AI assistant sent a reply Tom couldn't verify, so it wasn't shown. Here's Tom's built-in help instead.",
  basedOn: "Based on:",
  refMeta: (source, version) => `${source}, version ${version}`,
  draftRef: "draft, not yet reviewed",
  openInstructions: (title) => `Open ${title}`,
};

/** Human wording for refused actions (keys match ConsequentialAction). */
export const ACTION_WORDS_EN: Record<string, string> = {
  ACKNOWLEDGE: "acknowledge requests",
  HAZARD_DECISION: "record hazard decisions",
  SEND_ALERT: "send alerts or notifications",
  CONTACT: "call or message anyone",
  SUBMIT: "submit reports",
  ASSIGN_OR_CLOSE: "assign, resolve or cancel records",
};
