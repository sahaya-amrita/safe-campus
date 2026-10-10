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
  tourStart: (steps) => `Start guided tour (${steps} steps)`,
  tipsHeading: "Tips for this screen",
  noTips: "No tips to show here.",
  dismissTip: (title) => `Dismiss tip: ${title}`,
  dismissTipButton: "Dismiss",
  showDismissedTips: "Show dismissed tips",
  faqHeading: "Common questions",
  noFaqs: "No reviewed questions are available for this screen.",
  askLabel: "Ask about using this screen",
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
};
