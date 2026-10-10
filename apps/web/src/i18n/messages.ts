/**
 * Shape of every UI string for the student flow. Each language file must
 * implement this interface completely, so a missing translation is a type error.
 */
export interface Messages {
  languageName: string;
  languageLabel: string;
  unreviewedTranslation: string;

  prototypeTitle: string;
  prototypeBody: string;
  emergencyCall: string;
  emergencyCallSource: string;
  campusContactsMissing: string;
  mockServerNotice: string;

  connectionOnline: string;
  connectionOffline: string;
  connectionServerUnreachable: string;

  checkInHeading: string;
  checkInPrivacy: string;
  checkInSafe: string;
  checkInNeedHelp: string;
  duplicateIgnored: (time: string) => string;

  helpHeading: string;
  helpCallFirst: string;
  helpSend: string;
  helpCancel: string;
  helpNoteLabel: string;
  helpNoteCount: (count: number, max: number) => string;
  locationAdd: string;
  locationLocating: string;
  locationAttached: (accuracyMetres: number) => string;
  locationRemove: string;
  locationDenied: string;
  locationUnavailable: string;
  locationUnsupported: string;

  latestHeading: string;
  statusSafe: string;
  statusNeedHelp: string;
  createdOnPhoneAt: (time: string) => string;
  stateQueuedOffline: string;
  statePending: string;
  stateAccepted: string;
  stateFailed: string;
  detailQueuedWaiting: string;
  detailQueuedOffline: string;
  detailQueuedTimeout: string;
  detailQueuedServerUnavailable: string;
  detailPending: string;
  detailAccepted: (time: string) => string;
  detailAcceptedNotAcknowledged: string;
  detailFailedPermission: string;
  detailFailedRejected: string;
  detailFailedFallback: string;
  attempts: (count: number) => string;
  retry: string;
  storageFailed: string;

  historyHeading: string;
  historyEmpty: string;

  packsHeading: string;
  packsLoading: string;
  packsNone: string;
  packOfficial: (source: string) => string;
  packSample: string;
  packVersion: (version: string) => string;
  packLanguage: (language: string) => string;
  packPublished: (date: string) => string;
  packExpires: (date: string) => string;
  packSavedOnPhone: (date: string) => string;
  packExpired: string;
  packStale: string;
  packsRefreshOffline: string;
  packsRefreshTimeout: string;
  packsRefreshPermission: string;
  packsRefreshFailed: string;
  packsStorageFailed: string;
}
