import type { Messages } from './messages';

/** English — the source language. All other locales are translated from this file. */
export const en: Messages = {
  languageName: 'English',
  languageLabel: 'Language',
  languageDraftBadge: 'Draft translation',
  draftNotice:
    'This translation has not been checked yet. Important safety messages are also shown in English.',
  englishSourceLabel: 'English',

  tagline: 'Student safety check-in',
  prototypeBody:
    'Prototype — campus security does not monitor this app. Do not rely on it in an emergency.',
  mockServerNotice: 'Demo server: check-ins stay in this browser and reach no one.',

  navLabel: 'Sections',
  navHome: 'Home',
  navGuides: 'Guides',
  navActivity: 'Activity',

  connectionOnline: 'Online',
  connectionOffline: 'Offline. Check-ins are saved on this phone and not sent.',
  connectionServerUnreachable:
    'Online, but the server is not responding. Check-ins are not confirmed.',
  waitingToSend: (n) => (n === 1 ? '1 check-in waiting to send' : `${n} check-ins waiting to send`),

  sessionFor: (name) => `Checking in for: ${name}`,
  sessionLastChecked: (time) => `Last checked ${time}`,
  sessionLoading: 'Checking for an active drill or incident…',
  sessionNone:
    'No active drill or incident right now. A safe check-in needs one, but a help request is still sent to the server as an SOS. In an emergency, call 112.',
  sessionUnknown:
    'Could not check for an active drill or incident. Check-ins will wait on this phone.',
  modeDemo: 'Demo',
  modeDrill: 'Drill',
  modeTest: 'Test',
  modeSimulation: 'Simulation',

  checkInHeading: 'How are you right now?',
  checkInPrivacy:
    'A check-in shows how you were when you sent it. It does not share your location unless you choose to.',
  checkInSafe: "I'm Safe",
  checkInSafeHint: 'Let campus know you are okay',
  checkInNeedHelp: 'I Need Help',
  checkInNeedHelpHint: 'Send a request now, add details if you can',
  checkInLoading: 'Loading check-ins saved on this phone…',
  duplicateIgnored: (time) =>
    `Already recorded at ${time}. Wait a few seconds if you meant to send another.`,

  helpHeading: 'Request help',
  helpCallFirst:
    'This app cannot guarantee anyone will see your request. If you are in danger, call 112 now.',
  helpSend: 'Send help request',
  helpClose: 'Close',
  helpNoteLabel: 'What is happening? (optional)',
  helpNoteCount: (count, max) => `${count} of ${max} characters`,
  helpWhereHeading: 'Where are you? (optional)',
  helpPhotosHeading: 'Photos (optional)',
  landmarkLabel: 'Building, floor or landmark',
  landmarkHint: 'Describe it in your own words.',

  locationUse: 'Use my current location',
  locationHint: 'Only when you tap. Shared once with this request, not tracked.',
  locationLocating: 'Finding your location…',
  locationImproving: (m) => `Best so far: about ${m} m`,
  locationUseNow: 'Use this location',
  locationCancel: 'Stop',
  locationAttachedTitle: 'Location attached',
  locationAccuracy: (m) => `Accurate to about ${m} m`,
  locationCapturedAt: (time) => `Captured at ${time}`,
  locationLowAccuracy: (m) =>
    `Accuracy is low (about ${m} m). It may point to the wrong building — add a landmark.`,
  locationStale: 'This position is more than 2 minutes old. Get it again if you have moved.',
  locationRetry: 'Get location again',
  locationRemove: 'Remove location',
  locationInsecure:
    'This page is not secure (https), so the browser blocks location. Describe where you are instead.',
  locationDenied:
    "Location is turned off for this site. You can allow it in your browser's site settings, or describe where you are.",
  locationTimeout:
    'Could not get a location in time. This often happens indoors. Try again near a window, or describe where you are.',
  locationUnavailable:
    'Your phone could not find its location. Try again, or describe where you are.',
  locationUnsupported: 'This device cannot share location. Describe where you are instead.',

  photosTake: 'Take photo',
  photosChoose: 'Choose photos',
  photosCount: (count, max) => `${count} of ${max} photos`,
  photosRemove: (n) => `Remove photo ${n}`,
  photosReplace: (n) => `Replace photo ${n}`,
  photosPreparing: 'Preparing photo…',
  photoAlt: (n) => `Photo ${n}`,
  photosLocalOnly:
    'Photos stay on this phone. Sending photos is not available yet, so they are not included in your request.',
  photoErrTooMany: (max) => `You can add up to ${max} photos.`,
  photoErrType: 'Only JPEG, PNG or WebP photos can be added.',
  photoErrTooLarge: 'That photo is too large (over 15 MB).',
  photoErrUnreadable: 'That file could not be read as a photo.',
  photoErrStorageFull:
    'This phone is out of space for photos. Your request can still be sent without them.',
  photoErrStorageFailed:
    'Photos could not be saved on this phone. Your request can still be sent without them.',
  photosKeptOnPhone: (n) =>
    n === 1
      ? '1 photo kept on this phone only — not sent'
      : `${n} photos kept on this phone only — not sent`,
  photosDelete: 'Delete photos from this phone',
  photosUploadAfter:
    'Photos are sent after your help request reaches the server, so they never delay it.',
  photosSending: (n) => (n === 1 ? 'Sending 1 photo…' : `Sending ${n} photos…`),
  photosSent: (n) =>
    n === 1 ? '1 photo sent with your request' : `${n} photos sent with your request`,
  photosNotSent: (n) =>
    n === 1
      ? '1 photo not sent yet. It will be tried again.'
      : `${n} photos not sent yet. They will be tried again.`,

  latestHeading: 'Latest check-in',
  statusSafe: "I'm Safe",
  statusNeedHelp: 'I Need Help',
  createdOnPhoneAt: (time) => `Made on this phone at ${time}`,
  stateLocalOnly: 'Not sent — saved on this phone',
  stateQueued: 'Not sent — waiting to retry',
  stateSending: 'Sending — not confirmed yet',
  stateReceived: 'Received by the server',
  stateAcknowledged: 'Acknowledged by a responder',
  stateFailed: 'Failed — not delivered',
  trackLabel: 'Delivery progress',
  stepSaved: 'Saved on this phone',
  stepSent: 'Sent',
  stepReceived: 'Received by server',
  stepResponder: 'Seen by a responder',
  stepResponderUntracked: 'Not tracked in this prototype',
  detailQueuedWaiting: 'Saved on this phone. It has not been sent yet.',
  detailQueuedOffline:
    'Saved on this phone. It will be sent automatically when you are back online.',
  detailQueuedTimeout:
    'The server did not respond in time, so delivery is not confirmed. Retrying automatically.',
  detailQueuedServerUnavailable:
    'The server is unavailable, so delivery is not confirmed. Retrying automatically.',
  detailPending: 'Sending now. Not confirmed until the server replies.',
  detailReceived: (time) => `The server stored your check-in at ${time}.`,
  detailHelpOpen:
    'Your help request is open on the server. Open means waiting — no responder has confirmed seeing it.',
  detailAcceptedNotAcknowledged: 'This does not mean a responder has seen it.',
  detailFailedPermission:
    'You are not signed in or not allowed to send this. It was not delivered.',
  detailFailedRejected: 'The server refused this check-in. It was not delivered.',
  detailFailedNoSession:
    'No active drill or incident was known when you pressed this, so it could not be sent.',
  detailFailedInvalid: 'This check-in could not be prepared correctly, so it was not sent.',
  detailFailedFallback: 'Call 112 or tell campus security staff in person.',
  attempts: (n) => (n === 1 ? '1 send attempt' : `${n} send attempts`),
  retry: 'Try sending again',
  storageFailed: 'This phone could not save your check-in. It will be lost if you close the app.',

  activityHeading: 'Recent activity',
  activityEmpty: 'Earlier check-ins from this phone will appear here.',
  noCheckInsYet: 'No check-ins yet. Use the buttons above to tell campus how you are.',

  syncHeading: 'Sync status',
  syncLastReceived: (time) => `Last received by the server: ${time}`,
  syncNever: 'Nothing from this phone has reached the server yet.',
  offlineReady: 'This app can open on this phone without internet.',
  offlineNotReady:
    'Not yet saved for offline use. Open the app once while online from a secure (https) address.',
  storagePersisted:
    'Your browser has agreed to keep this app’s saved data when the phone is low on space.',
  storageNotPersisted: 'Your browser may clear saved check-ins if the phone runs low on space.',
  updateReady: 'A new version of the app is ready.',
  updateReload: 'Reload',

  emergencyHeading: 'Emergency',
  emergencyCall: 'Call 112',
  emergencyCallSource:
    "India's national emergency number for police, fire and ambulance. Not a campus number.",
  emergencyLimitation:
    'A call needs mobile network coverage. This app cannot place or relay calls.',

  contactsHeading: 'Campus contacts',
  contactsNone:
    'Campus security has not provided approved contact numbers yet. They will appear here once approved.',
  contactsMeanwhile: 'Until then, speak to campus security staff or your warden in person.',

  packsHeading: 'Safety instructions',
  packsLoading: 'Loading instructions…',
  packsNone:
    'No approved instructions are saved on this phone yet. Follow directions from campus security staff.',
  packOfficial: (source) => `Approved by ${source}`,
  packSample: 'Sample — not official campus instructions',
  packUnreadable: 'This instruction pack is in a format this app cannot display.',
  packVersion: (v) => `Version ${v}`,
  packLanguage: (l) => `Language: ${l}`,
  packPublished: (d) => `Published ${d}`,
  packExpires: (d) => `Expires ${d}`,
  packSavedOnPhone: (d) => `Saved on this phone ${d}`,
  packExpired: 'Expired. This may be out of date. Follow directions from campus security staff.',
  packStale: 'May be out of date. It has not been refreshed recently.',
  packsFallback: (name) => `No instructions are available in ${name} yet. Showing English instead.`,
  packsRefreshOffline: 'Offline. Showing the copy saved on this phone.',
  packsRefreshTimeout: 'The server did not respond. Showing the copy saved on this phone.',
  packsRefreshPermission:
    'Not allowed to download instructions. Showing the copy saved on this phone, if any.',
  packsRefreshFailed:
    'Could not refresh instructions. Showing the copy saved on this phone, if any.',
  packsStorageFailed: 'This phone could not save instructions for offline use.',
};
