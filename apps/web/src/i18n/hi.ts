import type { Messages } from './messages';

/**
 * Hindi — DRAFT, NOT REVIEWED by a native speaker or the institution.
 * Registered as UNREVIEWED_DRAFT in i18n/locales.ts; safety-critical strings
 * are shown with the English source until it is reviewed.
 */
export const hi: Messages = {
  languageName: 'हिन्दी',
  languageLabel: 'भाषा',
  languageDraftBadge: 'मसौदा अनुवाद',
  draftNotice:
    'इस अनुवाद की अभी जाँच नहीं हुई है। महत्वपूर्ण सुरक्षा संदेश अंग्रेज़ी में भी दिखाए जाते हैं।',
  englishSourceLabel: 'अंग्रेज़ी',

  tagline: 'छात्र सुरक्षा चेक-इन',
  prototypeBody:
    'प्रोटोटाइप — कैंपस सुरक्षा इस ऐप की निगरानी नहीं करती। आपातकाल में इस पर निर्भर न रहें।',
  mockServerNotice: 'डेमो सर्वर: चेक-इन इसी ब्राउज़र में रहते हैं और किसी तक नहीं पहुँचते।',

  navLabel: 'अनुभाग',
  navHome: 'होम',
  navGuides: 'मार्गदर्शिका',
  navActivity: 'गतिविधि',

  connectionOnline: 'ऑनलाइन',
  connectionOffline: 'ऑफ़लाइन। चेक-इन इस फ़ोन पर सहेजे जाते हैं और भेजे नहीं गए हैं।',
  connectionServerUnreachable:
    'ऑनलाइन, लेकिन सर्वर जवाब नहीं दे रहा। चेक-इन की पुष्टि नहीं हुई है।',
  waitingToSend: (n) => `${n} चेक-इन भेजे जाने की प्रतीक्षा में`,

  sessionFor: (name) => `इसके लिए चेक-इन: ${name}`,
  sessionLastChecked: (time) => `अंतिम जाँच ${time}`,
  sessionLoading: 'सक्रिय ड्रिल या घटना की जाँच हो रही है…',
  sessionNone:
    'अभी कोई सक्रिय ड्रिल या घटना नहीं है। सुरक्षित होने की सूचना के लिए यह ज़रूरी है, लेकिन मदद का अनुरोध SOS के रूप में सर्वर को भेजा जाएगा। आपातकाल में 112 पर कॉल करें।',
  sessionUnknown: 'सक्रिय ड्रिल या घटना की जाँच नहीं हो सकी। चेक-इन इस फ़ोन पर प्रतीक्षा करेंगे।',
  modeDemo: 'डेमो',
  modeDrill: 'ड्रिल',
  modeTest: 'परीक्षण',
  modeSimulation: 'सिमुलेशन',

  checkInHeading: 'आप अभी कैसे हैं?',
  checkInPrivacy:
    'चेक-इन बताता है कि भेजते समय आप कैसे थे। जब तक आप न चुनें, यह आपका स्थान साझा नहीं करता।',
  checkInSafe: 'मैं सुरक्षित हूँ',
  checkInSafeHint: 'कैंपस को बताएँ कि आप ठीक हैं',
  checkInNeedHelp: 'मुझे मदद चाहिए',
  checkInNeedHelpHint: 'अभी अनुरोध भेजें, हो सके तो विवरण जोड़ें',
  checkInLoading: 'इस फ़ोन पर सहेजे गए चेक-इन लोड हो रहे हैं…',
  duplicateIgnored: (time) =>
    `${time} पर पहले ही दर्ज हो चुका है। दूसरा भेजना हो तो कुछ सेकंड रुकें।`,

  helpHeading: 'मदद का अनुरोध',
  helpCallFirst:
    'यह ऐप गारंटी नहीं दे सकता कि कोई आपका अनुरोध देखेगा। अगर आप खतरे में हैं, तो अभी 112 पर कॉल करें।',
  helpSend: 'मदद का अनुरोध भेजें',
  helpClose: 'बंद करें',
  helpNoteLabel: 'क्या हो रहा है? (वैकल्पिक)',
  helpNoteCount: (count, max) => `${max} में से ${count} अक्षर`,
  helpWhereHeading: 'आप कहाँ हैं? (वैकल्पिक)',
  helpPhotosHeading: 'फ़ोटो (वैकल्पिक)',
  landmarkLabel: 'इमारत, मंज़िल या पहचान चिह्न',
  landmarkHint: 'अपने शब्दों में बताएँ।',

  locationUse: 'मेरा वर्तमान स्थान इस्तेमाल करें',
  locationHint: 'केवल टैप करने पर। इस अनुरोध के साथ एक बार साझा होगा, ट्रैक नहीं किया जाएगा।',
  locationLocating: 'आपका स्थान खोजा जा रहा है…',
  locationImproving: (m) => `अब तक सबसे सटीक: लगभग ${m} मी.`,
  locationUseNow: 'यह स्थान इस्तेमाल करें',
  locationCancel: 'रोकें',
  locationAttachedTitle: 'स्थान जोड़ा गया',
  locationAccuracy: (m) => `लगभग ${m} मी. तक सटीक`,
  locationCapturedAt: (time) => `${time} बजे लिया गया`,
  locationLowAccuracy: (m) =>
    `सटीकता कम है (लगभग ${m} मी.)। यह गलत इमारत दिखा सकता है — कोई पहचान चिह्न जोड़ें।`,
  locationStale: 'यह स्थान 2 मिनट से अधिक पुराना है। अगर आप हिल चुके हैं तो फिर से लें।',
  locationRetry: 'स्थान फिर से लें',
  locationRemove: 'स्थान हटाएँ',
  locationInsecure:
    'यह पेज सुरक्षित (https) नहीं है, इसलिए ब्राउज़र स्थान को रोकता है। इसके बजाय बताएँ कि आप कहाँ हैं।',
  locationDenied:
    'इस साइट के लिए स्थान बंद है। आप ब्राउज़र की साइट सेटिंग में इसकी अनुमति दे सकते हैं, या बताएँ कि आप कहाँ हैं।',
  locationTimeout:
    'समय पर स्थान नहीं मिल सका। इमारत के अंदर अक्सर ऐसा होता है। खिड़की के पास फिर से कोशिश करें, या बताएँ कि आप कहाँ हैं।',
  locationUnavailable:
    'आपका फ़ोन अपना स्थान नहीं खोज सका। फिर से कोशिश करें, या बताएँ कि आप कहाँ हैं।',
  locationUnsupported: 'यह डिवाइस स्थान साझा नहीं कर सकता। इसके बजाय बताएँ कि आप कहाँ हैं।',

  photosTake: 'फ़ोटो लें',
  photosChoose: 'फ़ोटो चुनें',
  photosCount: (count, max) => `${max} में से ${count} फ़ोटो`,
  photosRemove: (n) => `फ़ोटो ${n} हटाएँ`,
  photosReplace: (n) => `फ़ोटो ${n} बदलें`,
  photosPreparing: 'फ़ोटो तैयार हो रही है…',
  photoAlt: (n) => `फ़ोटो ${n}`,
  photosLocalOnly:
    'फ़ोटो इसी फ़ोन पर रहती हैं। फ़ोटो भेजने की सुविधा अभी उपलब्ध नहीं है, इसलिए वे आपके अनुरोध में शामिल नहीं होतीं।',
  photoErrTooMany: (max) => `आप अधिकतम ${max} फ़ोटो जोड़ सकते हैं।`,
  photoErrType: 'केवल JPEG, PNG या WebP फ़ोटो जोड़ी जा सकती हैं।',
  photoErrTooLarge: 'वह फ़ोटो बहुत बड़ी है (15 MB से अधिक)।',
  photoErrUnreadable: 'उस फ़ाइल को फ़ोटो के रूप में पढ़ा नहीं जा सका।',
  photoErrStorageFull:
    'इस फ़ोन में फ़ोटो के लिए जगह नहीं है। आपका अनुरोध उनके बिना भी भेजा जा सकता है।',
  photoErrStorageFailed:
    'फ़ोटो इस फ़ोन पर सहेजी नहीं जा सकीं। आपका अनुरोध उनके बिना भी भेजा जा सकता है।',
  photosKeptOnPhone: (n) => `${n} फ़ोटो केवल इसी फ़ोन पर — भेजी नहीं गईं`,
  photosDelete: 'इस फ़ोन से फ़ोटो हटाएँ',
  photosUploadAfter:
    'मदद का अनुरोध सर्वर तक पहुँचने के बाद फ़ोटो भेजी जाती हैं, ताकि अनुरोध में देरी न हो।',
  photosSending: (n) => `${n} फ़ोटो भेजी जा रही हैं…`,
  photosSent: (n) => `${n} फ़ोटो आपके अनुरोध के साथ भेजी गईं`,
  photosNotSent: (n) => `${n} फ़ोटो अभी नहीं भेजी गईं। फिर से कोशिश की जाएगी।`,

  latestHeading: 'नवीनतम चेक-इन',
  statusSafe: 'मैं सुरक्षित हूँ',
  statusNeedHelp: 'मुझे मदद चाहिए',
  createdOnPhoneAt: (time) => `इस फ़ोन पर ${time} बजे किया गया`,
  stateLocalOnly: 'नहीं भेजा गया — इस फ़ोन पर सहेजा गया',
  stateQueued: 'नहीं भेजा गया — दोबारा कोशिश की प्रतीक्षा',
  stateSending: 'भेजा जा रहा है — अभी पुष्टि नहीं',
  stateReceived: 'सर्वर को मिल गया',
  stateAcknowledged: 'रिस्पॉन्डर ने पुष्टि की',
  stateFailed: 'विफल — नहीं पहुँचा',
  trackLabel: 'भेजने की प्रगति',
  stepSaved: 'इस फ़ोन पर सहेजा गया',
  stepSent: 'भेजा गया',
  stepReceived: 'सर्वर को मिला',
  stepResponder: 'रिस्पॉन्डर ने देखा',
  stepResponderUntracked: 'इस प्रोटोटाइप में ट्रैक नहीं होता',
  detailQueuedWaiting: 'इस फ़ोन पर सहेजा गया। अभी भेजा नहीं गया है।',
  detailQueuedOffline: 'इस फ़ोन पर सहेजा गया। ऑनलाइन होते ही अपने-आप भेजा जाएगा।',
  detailQueuedTimeout:
    'सर्वर ने समय पर जवाब नहीं दिया, इसलिए पहुँचने की पुष्टि नहीं हुई। अपने-आप दोबारा कोशिश की जा रही है।',
  detailQueuedServerUnavailable:
    'सर्वर उपलब्ध नहीं है, इसलिए पहुँचने की पुष्टि नहीं हुई। अपने-आप दोबारा कोशिश की जा रही है।',
  detailPending: 'अभी भेजा जा रहा है। सर्वर के जवाब तक पुष्टि नहीं।',
  detailReceived: (time) => `सर्वर ने आपका चेक-इन ${time} बजे सहेजा।`,
  detailHelpOpen:
    'आपका मदद अनुरोध सर्वर पर खुला है। खुला का मतलब है प्रतीक्षा में — किसी रिस्पॉन्डर ने इसे देखने की पुष्टि नहीं की है।',
  detailAcceptedNotAcknowledged: 'इसका मतलब यह नहीं कि किसी रिस्पॉन्डर ने इसे देख लिया है।',
  detailFailedPermission:
    'आप साइन इन नहीं हैं या आपको इसे भेजने की अनुमति नहीं है। यह नहीं पहुँचा।',
  detailFailedRejected: 'सर्वर ने यह चेक-इन अस्वीकार कर दिया। यह नहीं पहुँचा।',
  detailFailedNoSession:
    'जब आपने इसे दबाया, तब कोई सक्रिय ड्रिल या घटना ज्ञात नहीं थी, इसलिए इसे भेजा नहीं जा सका।',
  detailFailedInvalid: 'यह चेक-इन सही तरह तैयार नहीं हो सका, इसलिए भेजा नहीं गया।',
  detailFailedFallback: '112 पर कॉल करें या कैंपस सुरक्षा कर्मचारियों को खुद जाकर बताएँ।',
  attempts: (n) => `भेजने के प्रयास: ${n}`,
  retry: 'फिर से भेजें',
  storageFailed: 'यह फ़ोन आपका चेक-इन सहेज नहीं सका। ऐप बंद करने पर यह खो जाएगा।',

  activityHeading: 'हाल की गतिविधि',
  activityEmpty: 'इस फ़ोन से किए गए पिछले चेक-इन यहाँ दिखेंगे।',
  noCheckInsYet: 'अभी कोई चेक-इन नहीं। आप कैसे हैं, यह बताने के लिए ऊपर दिए बटन इस्तेमाल करें।',

  syncHeading: 'सिंक स्थिति',
  syncLastReceived: (time) => `सर्वर को आखिरी बार मिला: ${time}`,
  syncNever: 'इस फ़ोन से अभी तक कुछ भी सर्वर तक नहीं पहुँचा है।',
  offlineReady: 'यह ऐप इस फ़ोन पर बिना इंटरनेट के खुल सकता है।',
  offlineNotReady:
    'अभी ऑफ़लाइन उपयोग के लिए सहेजा नहीं गया। सुरक्षित (https) पते से ऑनलाइन रहते हुए ऐप एक बार खोलें।',
  storagePersisted:
    'फ़ोन में जगह कम होने पर भी आपका ब्राउज़र इस ऐप का सहेजा गया डेटा रखने के लिए सहमत है।',
  storageNotPersisted: 'फ़ोन में जगह कम होने पर आपका ब्राउज़र सहेजे गए चेक-इन मिटा सकता है।',
  updateReady: 'ऐप का नया संस्करण तैयार है।',
  updateReload: 'फिर से लोड करें',

  emergencyHeading: 'आपातकाल',
  emergencyCall: '112 पर कॉल करें',
  emergencyCallSource:
    'पुलिस, अग्निशमन और एम्बुलेंस के लिए भारत का राष्ट्रीय आपातकालीन नंबर। यह कैंपस नंबर नहीं है।',
  emergencyLimitation:
    'कॉल करने के लिए मोबाइल नेटवर्क कवरेज चाहिए। यह ऐप कॉल न तो कर सकता है और न आगे भेज सकता है।',

  contactsHeading: 'कैंपस संपर्क',
  contactsNone:
    'कैंपस सुरक्षा ने अभी तक स्वीकृत संपर्क नंबर नहीं दिए हैं। स्वीकृत होने पर वे यहाँ दिखेंगे।',
  contactsMeanwhile: 'तब तक, कैंपस सुरक्षा कर्मचारियों या अपने वार्डन से सीधे बात करें।',

  packsHeading: 'सुरक्षा निर्देश',
  packsLoading: 'निर्देश लोड हो रहे हैं…',
  packsNone:
    'इस फ़ोन पर अभी कोई स्वीकृत निर्देश सहेजे नहीं गए हैं। कैंपस सुरक्षा कर्मचारियों के निर्देशों का पालन करें।',
  packOfficial: (source) => `${source} द्वारा स्वीकृत`,
  packSample: 'नमूना — आधिकारिक कैंपस निर्देश नहीं',
  packUnreadable: 'यह निर्देश पैक ऐसे प्रारूप में है जिसे यह ऐप नहीं दिखा सकता।',
  packVersion: (v) => `संस्करण ${v}`,
  packLanguage: (l) => `भाषा: ${l}`,
  packPublished: (d) => `प्रकाशित ${d}`,
  packExpires: (d) => `समाप्ति ${d}`,
  packSavedOnPhone: (d) => `इस फ़ोन पर सहेजा गया ${d}`,
  packExpired: 'समाप्त। यह पुराना हो सकता है। कैंपस सुरक्षा कर्मचारियों के निर्देशों का पालन करें।',
  packStale: 'पुराना हो सकता है। हाल में अपडेट नहीं हुआ।',
  packsFallback: (name) =>
    `${name} में अभी निर्देश उपलब्ध नहीं हैं। अंग्रेज़ी में दिखाए जा रहे हैं।`,
  packsRefreshOffline: 'ऑफ़लाइन। इस फ़ोन पर सहेजी गई प्रति दिखाई जा रही है।',
  packsRefreshTimeout: 'सर्वर ने जवाब नहीं दिया। इस फ़ोन पर सहेजी गई प्रति दिखाई जा रही है।',
  packsRefreshPermission:
    'निर्देश डाउनलोड करने की अनुमति नहीं। सहेजी गई प्रति हो तो वह दिखाई जा रही है।',
  packsRefreshFailed: 'निर्देश अपडेट नहीं हो सके। सहेजी गई प्रति हो तो वह दिखाई जा रही है।',
  packsStorageFailed: 'यह फ़ोन ऑफ़लाइन उपयोग के लिए निर्देश सहेज नहीं सका।',
};
