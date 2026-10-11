/**
 * Every UI string for the student flow. Each locale implements this interface
 * completely, so a missing translation is a compile-time error.
 * The brand name and tagline are brand assets and are not translated.
 */
export interface Messages {
  languageName: string;
  languageLabel: string;
  languageDraftBadge: string;
  draftNotice: string;
  englishSourceLabel: string;

  tagline: string;
  prototypeBody: string;
  mockServerNotice: string;

  navLabel: string;
  navHome: string;
  navGuides: string;
  navActivity: string;

  connectionOnline: string;
  connectionOffline: string;
  connectionServerUnreachable: string;
  waitingToSend: (count: number) => string;

  sessionFor: (name: string) => string;
  sessionLastChecked: (time: string) => string;
  sessionLoading: string;
  sessionNone: string;
  sessionUnknown: string;
  modeDemo: string;
  modeDrill: string;
  modeTest: string;
  modeSimulation: string;

  checkInHeading: string;
  checkInPrivacy: string;
  checkInSafe: string;
  checkInSafeHint: string;
  checkInNeedHelp: string;
  checkInNeedHelpHint: string;
  checkInLoading: string;
  duplicateIgnored: (time: string) => string;

  helpHeading: string;
  helpCallFirst: string;
  helpSend: string;
  helpClose: string;
  helpNoteLabel: string;
  helpNoteCount: (count: number, max: number) => string;
  helpWhereHeading: string;
  helpPhotosHeading: string;
  landmarkLabel: string;
  landmarkHint: string;

  locationUse: string;
  locationHint: string;
  locationLocating: string;
  locationImproving: (metres: number) => string;
  locationUseNow: string;
  locationCancel: string;
  locationAttachedTitle: string;
  locationAccuracy: (metres: number) => string;
  locationCapturedAt: (time: string) => string;
  locationLowAccuracy: (metres: number) => string;
  locationStale: string;
  locationRetry: string;
  locationRemove: string;
  locationInsecure: string;
  locationDenied: string;
  locationTimeout: string;
  locationUnavailable: string;
  locationUnsupported: string;

  photosTake: string;
  photosChoose: string;
  photosCount: (count: number, max: number) => string;
  photosRemove: (n: number) => string;
  photosReplace: (n: number) => string;
  photosPreparing: string;
  photoAlt: (n: number) => string;
  photosLocalOnly: string;
  photoErrTooMany: (max: number) => string;
  photoErrType: string;
  photoErrTooLarge: string;
  photoErrUnreadable: string;
  photoErrStorageFull: string;
  photoErrStorageFailed: string;
  photosKeptOnPhone: (count: number) => string;
  photosDelete: string;
  photosUploadAfter: string;
  photosSending: (count: number) => string;
  photosSent: (count: number) => string;
  photosNotSent: (count: number) => string;

  latestHeading: string;
  statusSafe: string;
  statusNeedHelp: string;
  createdOnPhoneAt: (time: string) => string;
  stateLocalOnly: string;
  stateQueued: string;
  stateSending: string;
  stateReceived: string;
  stateAcknowledged: string;
  stateFailed: string;
  trackLabel: string;
  stepSaved: string;
  stepSent: string;
  stepReceived: string;
  stepResponder: string;
  stepResponderUntracked: string;
  detailQueuedWaiting: string;
  detailQueuedOffline: string;
  detailQueuedTimeout: string;
  detailQueuedServerUnavailable: string;
  detailPending: string;
  detailReceived: (time: string) => string;
  detailHelpOpen: string;
  detailAcceptedNotAcknowledged: string;
  detailFailedPermission: string;
  detailFailedRejected: string;
  detailFailedNoSession: string;
  detailFailedInvalid: string;
  detailFailedFallback: string;
  attempts: (count: number) => string;
  retry: string;
  storageFailed: string;

  activityHeading: string;
  activityEmpty: string;
  noCheckInsYet: string;

  syncHeading: string;
  syncLastReceived: (time: string) => string;
  syncNever: string;
  offlineReady: string;
  offlineNotReady: string;
  storagePersisted: string;
  storageNotPersisted: string;
  updateReady: string;
  updateReload: string;

  emergencyHeading: string;
  emergencyCall: string;
  emergencyCallSource: string;
  emergencyLimitation: string;

  contactsHeading: string;
  contactsNone: string;
  contactsMeanwhile: string;

  packsHeading: string;
  packsLoading: string;
  packsNone: string;
  packOfficial: (source: string) => string;
  packSample: string;
  packUnreadable: string;
  packVersion: (version: string) => string;
  packLanguage: (language: string) => string;
  packPublished: (date: string) => string;
  packExpires: (date: string) => string;
  packSavedOnPhone: (date: string) => string;
  packExpired: string;
  packStale: string;
  packsFallback: (languageName: string) => string;
  packsRefreshOffline: string;
  packsRefreshTimeout: string;
  packsRefreshPermission: string;
  packsRefreshFailed: string;
  packsStorageFailed: string;
}

/**
 * Strings whose meaning must not be lost in an unchecked translation. When the
 * selected language is not reviewed, the UI shows the English source next to
 * the draft for these keys (see `CriticalText`).
 */
export const SAFETY_CRITICAL_KEYS = [
  'prototypeBody',
  'connectionOffline',
  'connectionServerUnreachable',
  'sessionNone',
  'helpCallFirst',
  'stateLocalOnly',
  'stateQueued',
  'stateFailed',
  'detailAcceptedNotAcknowledged',
  'detailHelpOpen',
  'detailFailedFallback',
  'storageFailed',
  'photosLocalOnly',
  'photosUploadAfter',
  'emergencyLimitation',
  'packExpired',
] as const satisfies readonly (keyof Messages)[];

export type SafetyCriticalKey = (typeof SAFETY_CRITICAL_KEYS)[number];
