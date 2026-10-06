import type { SupportedLanguage } from '@/stores/appStore';

type TranslationKey =
  | 'auth.continueOfflineAccountDescription'
  | 'auth.alreadyHaveAccount'
  | 'auth.noAccount'
  | 'auth.pendingOfflineChanges'
  | 'auth.learningDataOffline'
  | 'auth.passwordPlaceholder'
  | 'auth.forgotPasswordTitle'
  | 'auth.forgotPasswordDescription'
  | 'auth.sendResetLink'
  | 'auth.checkInbox'
  | 'auth.resetInstructions'
  | 'auth.tryAnotherEmail'
  | 'auth.backToLogin'
  | 'auth.passwordMismatch'
  | 'auth.passwordUpdated'
  | 'auth.passwordUpdatedDescription'
  | 'auth.setNewPassword'
  | 'auth.incompleteResetLink'
  | 'auth.choosePassword'
  | 'auth.goToLogin'
  | 'auth.newPassword'
  | 'auth.confirmPassword'
  | 'auth.typePasswordAgain'
  | 'auth.updatePassword'
  | 'auth.requestNewLink'
  | 'dashboard.offlineMode'
  | 'dashboard.savingProgress'
  | 'dashboard.guestChangesSaved'
  | 'dashboard.changesWaitingToSync'
  | 'dashboard.logInToBackUp'
  | 'dashboard.progressBackedUp'
  | 'dashboard.learningWithoutInternet'
  | 'dashboard.greetingWithName'
  | 'dashboard.greeting'
  | 'dashboard.startStarterBundle'
  | 'dashboard.continueLesson'
  | 'dashboard.continueWhereLeftOff'
  | 'dashboard.sampleLessonsOffline'
  | 'dashboard.percentCompleted'
  | 'dashboard.browseCourses'
  | 'dashboard.scholarshipDescription'
  | 'dashboard.learningContinues'
  | 'dashboard.progressSavedLocally'
  | 'dashboard.logInOrCreateAccount'
  | 'courseList.downloaded'
  | 'courseList.availableOffline'
  | 'courseList.starterBundle'
  | 'courseList.exploreWithoutAccount'
  | 'courseList.bundleMetadata'
  | 'courseList.allCourses'
  | 'courseList.courseCount'
  | 'courseList.courseMetadata'
  | 'courseList.percentDone'
  | 'courseList.savedCoursesOffline'
  | 'courseList.couldNotRefresh'
  | 'courseList.noDownloads'
  | 'courseList.empty'
  | 'courseList.connectToSeeAll'
  | 'offline.title'
  | 'offline.subtitle'
  | 'offline.starterPack'
  | 'offline.downloadedMaterial'
  | 'offline.currentCourse'
  | 'offline.sampleSubjectCount'
  | 'offline.availableOffline'
  | 'offline.learningProgress'
  | 'offline.lessonQuizAi'
  | 'offline.openStarter'
  | 'offline.readLessons'
  | 'offline.practiceNoInternet'
  | 'offline.askDownloaded'
  | 'offline.trackProgress'
  | 'offline.learningOffline'
  | 'offline.progressWillSync'
  | 'offline.availableOffline'
  | 'offline.lessons'
  | 'offline.myProgress'
  | 'starter.welcome'
  | 'starter.description'
  | 'starter.availableOffline'
  | 'starter.exploreCourses'
  | 'starter.chooseSubject'
  | 'starter.courseCount'
  | 'starter.demoLessonCount'
  | 'starter.demoQuiz'
  | 'quiz.title'
  | 'quiz.practiceOffline'
  | 'quiz.empty'
  | 'quiz.questionCount'
  | 'quiz.bestScore'
  | 'quiz.unavailable'
  | 'quiz.downloadToPlay'
  | 'quiz.completed'
  | 'quiz.resultSynced'
  | 'quiz.resultLocal'
  | 'quiz.yourScore'
  | 'quiz.savedOffline'
  | 'quiz.correct'
  | 'quiz.backToDashboard'
  | 'quiz.offlineMode'
  | 'quiz.offlineBanner'
  | 'quiz.questionNumber'
  | 'quiz.finish'
  | 'quiz.nextQuestion'
  | 'ai.thinking'
  | 'ai.suggestionListTuple'
  | 'ai.suggestionPrimaryKey'
  | 'ai.suggestionOsi'
  | 'ai.confidenceHigh'
  | 'ai.confidenceMedium'
  | 'ai.confidenceLow'
  | 'profileEdit.title'
  | 'profileEdit.onlineRequired'
  | 'profileEdit.education'
  | 'profileEdit.educationLevel'
  | 'profileEdit.institution'
  | 'profileEdit.courseAndSemester'
  | 'profileEdit.coursePlaceholder'
  | 'profileEdit.semesterPlaceholder'
  | 'profileEdit.interests'
  | 'profileEdit.interestsHint'
  | 'profileEdit.scholarshipMatching'
  | 'profileEdit.dateOfBirth'
  | 'profileEdit.dateFormatHint'
  | 'profileEdit.datePlaceholder'
  | 'profileEdit.gender'
  | 'profileEdit.state'
  | 'profileEdit.statePlaceholder'
  | 'profileEdit.category'
  | 'profileEdit.familyIncome'
  | 'profileEdit.incomePlaceholder'
  | 'profileEdit.personWithDisability'
  | 'profileEdit.useDetailsForMatching'
  | 'profileEdit.sensitiveDetailsNotice'
  | 'profileEdit.female'
  | 'profileEdit.male'
  | 'profileEdit.other'
  | 'profileEdit.preferNotToSay'
  | 'profileEdit.school'
  | 'profileEdit.diploma'
  | 'profileEdit.undergraduate'
  | 'profileEdit.postgraduate'
  | 'profileEdit.yes'
  | 'profileEdit.no'
  | 'profileEdit.invalidDateOfBirth'
  | 'profileEdit.invalidIncome'
  | 'profileEdit.invalidSemester'
  | 'scholarship.find'
  | 'scholarship.subtitle'
  | 'scholarship.loginPrompt'
  | 'scholarship.completeProfilePrompt'
  | 'scholarship.completeProfile'
  | 'scholarship.offlineResults'
  | 'scholarship.searchPlaceholder'
  | 'scholarship.all'
  | 'scholarship.likelyMatch'
  | 'scholarship.checkDetails'
  | 'scholarship.notMatch'
  | 'scholarship.forYou'
  | 'scholarship.notFound'
  | 'scholarship.tryDifferent'
  | 'scholarship.information'
  | 'scholarship.deadline'
  | 'scholarship.open'
  | 'scholarship.apply'
  | 'scholarship.verified'
  | 'scholarship.defaultDisclaimer'
  | 'courseDetails.title'
  | 'courseDetails.unavailable'
  | 'courseDetails.connectToLoad'
  | 'courseDetails.pack'
  | 'courseDetails.removeDownload'
  | 'courseDetails.removeWarning'
  | 'courseDetails.remove'
  | 'courseDetails.downloadLogin'
  | 'courseDetails.downloadButton'
  | 'courseDetails.liteButton'
  | 'courseDetails.courseCompleted'
  | 'courseDetails.startFirstLesson'
  | 'courseDetails.keepGoing'
  | 'courseDetails.continueWhereLeftOff'
  | 'courseDetails.tapLessonToStart'
  | 'courseDetails.noLessons'
  | 'courseDetails.quizPhoneOffline'
  | 'courseDetails.learningContinuesOffline'
  | 'courseDetails.progressSavedOffline'
  | 'courseDetails.versionAvailable'
  | 'courseDetails.downloadedOnPhone'
  | 'courseDetails.loginToDownloadDescription'
  | 'courseDetails.downloadOnce'
  | 'courseDetails.connectToDownload'
  | 'lesson.notOnPhone'
  | 'lesson.downloadToReadOffline'
  | 'lesson.numberOfTotal'
  | 'lesson.number'
  | 'lesson.aboutMinutes'
  | 'lesson.mediaOmitted'
  | 'lesson.savedOnDevice'
  | 'lesson.askAI'
  | 'lesson.askDoubts'
  | 'lesson.myNotes'
  | 'lesson.addNotes'
  | 'lesson.savedOnPhone'
  | 'lesson.savePersonalNotes'
  | 'lesson.writeNotes'
  | 'lesson.saveNote'
  | 'lesson.deleteNote'
  | 'lesson.lessonCompleted'
  | 'lesson.markCompleted'
  | 'lesson.previous'
  | 'lesson.next'
  | 'courseDetails.downloading'
  | 'courseDetails.update'
  | 'courseDetails.ready'
  | 'courseDetails.updateWhenOnline'
  | 'courseDetails.completedLessons'
  | 'courseDetails.moreLessons'
  | 'courseDetails.lessonDuration'
  | 'courseDetails.questionCount';

type TranslationTable = Partial<Record<TranslationKey, Record<SupportedLanguage, string>>>;

export const SCREEN_EXTRAS: TranslationTable = {
  'auth.continueOfflineAccountDescription': {
    en: 'Explore the Starter Bundle without an account. Your progress is saved on this device and can be added to an account later.',
    hi: 'बिना अकाउंट के स्टार्टर बंडल देखें। आपकी प्रगति इस डिवाइस पर सहेजी जाती है और बाद में अकाउंट में जोड़ी जा सकती है।',
    mr: 'खात्याशिवाय स्टार्टर बंडल पाहा. तुमची प्रगती या डिव्हाइसवर जतन होते आणि नंतर खात्यात जोडता येते.',
    bn: 'অ্যাকাউন্ট ছাড়াই স্টার্টার বান্ডেল দেখুন। আপনার অগ্রগতি এই ডিভাইসে সংরক্ষিত হয় এবং পরে অ্যাকাউন্টে যোগ করা যায়।',
    ta: 'கணக்கு இல்லாமல் ஸ்டார்டர் தொகுப்பைப் பாருங்கள். உங்கள் முன்னேற்றம் இந்த சாதனத்தில் சேமிக்கப்பட்டு பின்னர் கணக்கில் சேர்க்கப்படும்.',
    te: 'ఖాతా లేకుండానే స్టార్టర్ బండిల్‌ను చూడండి. మీ ప్రగతి ఈ పరికరంలో సేవ్ అవుతుంది, తర్వాత ఖాతాకు జోడించవచ్చు.',
    gu: 'ખાતા વિના સ્ટાર્ટર બંડલ જુઓ. તમારી પ્રગતિ આ ઉપકરણમાં સાચવાય છે અને પછી ખાતામાં ઉમેરી શકાય છે.',
  },
  'auth.alreadyHaveAccount': {
    en: 'Already have an account?', hi: 'पहले से अकाउंट है?', mr: 'आधीपासून खाते आहे?', bn: 'ইতিমধ্যে অ্যাকাউন্ট আছে?', ta: 'ஏற்கனவே கணக்கு உள்ளதா?', te: 'ఇప్పటికే ఖాతా ఉందా?', gu: 'પહેલેથી ખાતું છે?',
  },
  'auth.noAccount': {
    en: "Don't have an account?", hi: 'अकाउंट नहीं है?', mr: 'खाते नाही?', bn: 'অ্যাকাউন্ট নেই?', ta: 'கணக்கு இல்லையா?', te: 'ఖాతా లేదా?', gu: 'ખાતું નથી?',
  },
  'auth.pendingOfflineChanges': {
    en: '{{count}} offline change(s) will be saved to your account.', hi: '{{count}} ऑफ़लाइन बदलाव आपके अकाउंट में सहेजे जाएंगे।', mr: '{{count}} ऑफलाइन बदल तुमच्या खात्यात जतन होतील.', bn: '{{count}}টি অফলাইন পরিবর্তন আপনার অ্যাকাউন্টে সংরক্ষিত হবে।', ta: '{{count}} ஆஃப்லைன் மாற்றங்கள் உங்கள் கணக்கில் சேமிக்கப்படும்.', te: '{{count}} ఆఫ్‌లైన్ మార్పులు మీ ఖాతాలో సేవ్ అవుతాయి.', gu: '{{count}} ઑફલાઇન ફેરફારો તમારા ખાતામાં સાચવવામાં આવશે.',
  },
  'auth.learningDataOffline': {
    en: 'Your learning data stays available offline on this device.', hi: 'आपका सीखने का डेटा इस डिवाइस पर ऑफ़लाइन उपलब्ध रहेगा।', mr: 'तुमचा शिकण्याचा डेटा या डिव्हाइसवर ऑफलाइन उपलब्ध राहील.', bn: 'আপনার শেখার তথ্য এই ডিভাইসে অফলাইনে পাওয়া যাবে।', ta: 'உங்கள் கற்றல் தரவு இந்த சாதனத்தில் ஆஃப்லைனிலும் கிடைக்கும்.', te: 'మీ అభ్యాస డేటా ఈ పరికరంలో ఆఫ్‌లైన్‌లో అందుబాటులో ఉంటుంది.', gu: 'તમારો અભ્યાસ ડેટા આ ઉપકરણમાં ઑફલાઇન ઉપલબ્ધ રહેશે.',
  },
  'auth.passwordPlaceholder': {
    en: 'Enter your password', hi: 'अपना पासवर्ड दर्ज करें', mr: 'तुमचा पासवर्ड टाका', bn: 'আপনার পাসওয়ার্ড লিখুন', ta: 'உங்கள் கடவுச்சொல்லை உள்ளிடவும்', te: 'మీ పాస్‌వర్డ్‌ను నమోదు చేయండి', gu: 'તમારો પાસવર્ડ દાખલ કરો',
  },
  'auth.forgotPasswordTitle': {
    en: 'Forgot Password?', hi: 'पासवर्ड भूल गए?', mr: 'पासवर्ड विसरलात?', bn: 'পাসওয়ার্ড ভুলে গেছেন?', ta: 'கடவுச்சொல்லை மறந்துவிட்டீர்களா?', te: 'పాస్‌వర్డ్ మర్చిపోయారా?', gu: 'પાસવર્ડ ભૂલી ગયા?',
  },
  'auth.forgotPasswordDescription': {
    en: 'No worries. Enter your registered email or phone and we’ll help you reset your password.', hi: 'कोई बात नहीं। अपना पंजीकृत ईमेल या फोन दर्ज करें और हम पासवर्ड रीसेट करने में मदद करेंगे।', mr: 'काळजी करू नका. नोंदणीकृत ईमेल किंवा फोन टाका; पासवर्ड रीसेट करण्यात मदत करू.', bn: 'চিন্তা নেই। নিবন্ধিত ইমেল বা ফোন লিখুন, আমরা পাসওয়ার্ড রিসেট করতে সাহায্য করব।', ta: 'கவலை வேண்டாம். பதிவு செய்த மின்னஞ்சல் அல்லது தொலைபேசியை உள்ளிடுங்கள்; கடவுச்சொல்லை மீட்டமைக்க உதவுகிறோம்.', te: 'పరవాలేదు. నమోదు చేసిన ఇమెయిల్ లేదా ఫోన్‌ను నమోదు చేయండి; పాస్‌వర్డ్ రీసెట్ చేయడంలో సహాయం చేస్తాము.', gu: 'ચિંતા નહીં. નોંધાયેલ ઇમેઇલ અથવા ફોન દાખલ કરો; પાસવર્ડ રીસેટ કરવામાં મદદ કરીશું.',
  },
  'auth.sendResetLink': {
    en: 'Send Reset Link', hi: 'रीसेट लिंक भेजें', mr: 'रीसेट लिंक पाठवा', bn: 'রিসেট লিঙ্ক পাঠান', ta: 'மீட்டமைப்பு இணைப்பை அனுப்பு', te: 'రీసెట్ లింక్ పంపండి', gu: 'રીસેટ લિંક મોકલો',
  },
  'auth.checkInbox': {
    en: 'Check your inbox', hi: 'अपना इनबॉक्स देखें', mr: 'तुमचा इनबॉक्स तपासा', bn: 'আপনার ইনবক্স দেখুন', ta: 'உங்கள் இன்பாக்ஸைச் சரிபார்க்கவும்', te: 'మీ ఇన్‌బాక్స్‌ను చూడండి', gu: 'તમારું ઇનબોક્સ તપાસો',
  },
  'auth.resetInstructions': {
    en: 'If an account exists for this email or phone, you’ll receive instructions to reset your password.', hi: 'यदि इस ईमेल या फोन से अकाउंट मौजूद है, तो आपको पासवर्ड रीसेट करने के निर्देश मिलेंगे।', mr: 'या ईमेल किंवा फोनसाठी खाते असल्यास, पासवर्ड रीसेट करण्याच्या सूचना मिळतील.', bn: 'এই ইমেল বা ফোনের জন্য অ্যাকাউন্ট থাকলে পাসওয়ার্ড রিসেটের নির্দেশাবলী পাবেন।', ta: 'இந்த மின்னஞ்சல் அல்லது தொலைபேசிக்கு கணக்கு இருந்தால், கடவுச்சொல்லை மீட்டமைப்பதற்கான வழிமுறைகள் கிடைக்கும்.', te: 'ఈ ఇమెయిల్ లేదా ఫోన్‌కు ఖాతా ఉంటే, పాస్‌వర్డ్ రీసెట్ సూచనలు అందుతాయి.', gu: 'આ ઇમેઇલ અથવા ફોન માટે ખાતું હશે તો પાસવર્ડ રીસેટ કરવાની સૂચનાઓ મળશે.',
  },
  'auth.tryAnotherEmail': {
    en: 'Try another email', hi: 'दूसरा ईमेल आज़माएं', mr: 'दुसरा ईमेल वापरून पाहा', bn: 'অন্য ইমেল চেষ্টা করুন', ta: 'வேறு மின்னஞ்சலை முயற்சிக்கவும்', te: 'మరో ఇమెయిల్ ప్రయత్నించండి', gu: 'બીજો ઇમેઇલ અજમાવો',
  },
  'auth.backToLogin': {
    en: 'Back to Login', hi: 'लॉगिन पर वापस जाएं', mr: 'लॉगिनवर परत जा', bn: 'লগইনে ফিরে যান', ta: 'உள்நுழைவுக்குத் திரும்பு', te: 'లాగిన్‌కు తిరిగి వెళ్ళండి', gu: 'લૉગિન પર પાછા જાઓ',
  },
  'auth.passwordMismatch': {
    en: 'The two passwords do not match.', hi: 'दोनों पासवर्ड मेल नहीं खाते।', mr: 'दोन्ही पासवर्ड जुळत नाहीत.', bn: 'দুটি পাসওয়ার্ড মিলছে না।', ta: 'இரண்டு கடவுச்சொற்களும் பொருந்தவில்லை.', te: 'రెండు పాస్‌వర్డ్‌లు సరిపోలడం లేదు.', gu: 'બંને પાસવર્ડ મેળ ખાતા નથી.',
  },
  'auth.passwordUpdated': {
    en: 'Password updated', hi: 'पासवर्ड अपडेट हो गया', mr: 'पासवर्ड अपडेट केला', bn: 'পাসওয়ার্ড আপডেট হয়েছে', ta: 'கடவுச்சொல் புதுப்பிக்கப்பட்டது', te: 'పాస్‌వర్డ్ నవీకరించబడింది', gu: 'પાસવર્ડ અપડેટ થયો',
  },
  'auth.passwordUpdatedDescription': {
    en: 'You can now log in with your new password on any device.', hi: 'अब आप किसी भी डिवाइस पर नए पासवर्ड से लॉगिन कर सकते हैं।', mr: 'आता तुम्ही कोणत्याही डिव्हाइसवर नवीन पासवर्डने लॉगिन करू शकता.', bn: 'এখন যেকোনো ডিভাইসে নতুন পাসওয়ার্ড দিয়ে লগ ইন করতে পারবেন।', ta: 'இப்போது எந்த சாதனத்திலும் புதிய கடவுச்சொல்லுடன் உள்நுழையலாம்.', te: 'ఇప్పుడు ఏ పరికరంలోనైనా కొత్త పాస్‌వర్డ్‌తో లాగిన్ చేయవచ్చు.', gu: 'હવે તમે કોઈપણ ઉપકરણમાં નવા પાસવર્ડથી લૉગિન કરી શકો છો.',
  },
  'auth.setNewPassword': {
    en: 'Set a new password', hi: 'नया पासवर्ड सेट करें', mr: 'नवीन पासवर्ड सेट करा', bn: 'নতুন পাসওয়ার্ড সেট করুন', ta: 'புதிய கடவுச்சொல்லை அமைக்கவும்', te: 'కొత్త పాస్‌వర్డ్‌ను సెట్ చేయండి', gu: 'નવો પાસવર્ડ સેટ કરો',
  },
  'auth.incompleteResetLink': {
    en: 'This reset link is incomplete. Open the link from your email again, or request a new one.', hi: 'यह रीसेट लिंक अधूरा है। ईमेल में मिले लिंक को फिर से खोलें या नया लिंक मांगें।', mr: 'ही रीसेट लिंक अपूर्ण आहे. ईमेलमधील लिंक पुन्हा उघडा किंवा नवीन लिंक मागवा.', bn: 'রিসেট লিঙ্কটি অসম্পূর্ণ। ইমেল থেকে লিঙ্কটি আবার খুলুন অথবা নতুন লিঙ্ক চান।', ta: 'இந்த மீட்டமைப்பு இணைப்பு முழுமையில்லை. மின்னஞ்சலில் உள்ள இணைப்பை மீண்டும் திறக்கவும் அல்லது புதியதைப் பெறவும்.', te: 'ఈ రీసెట్ లింక్ పూర్తిగా లేదు. ఇమెయిల్‌లోని లింక్‌ను మళ్లీ తెరవండి లేదా కొత్తదాన్ని అభ్యర్థించండి.', gu: 'આ રીસેટ લિંક અધૂરી છે. ઇમેઇલની લિંક ફરી ખોલો અથવા નવી લિંક માગો.',
  },
  'auth.choosePassword': {
    en: 'Choose a password with at least 8 characters.', hi: 'कम से कम 8 अक्षरों वाला पासवर्ड चुनें।', mr: 'किमान 8 अक्षरांचा पासवर्ड निवडा.', bn: 'কমপক্ষে ৮ অক্ষরের পাসওয়ার্ড বেছে নিন।', ta: 'குறைந்தது 8 எழுத்துகள் கொண்ட கடவுச்சொல்லைத் தேர்ந்தெடுக்கவும்.', te: 'కనీసం 8 అక్షరాల పాస్‌వర్డ్‌ను ఎంచుకోండి.', gu: 'ઓછામાં ઓછા 8 અક્ષરનો પાસવર્ડ પસંદ કરો.',
  },
  'auth.goToLogin': {
    en: 'Go to Login', hi: 'लॉगिन पर जाएं', mr: 'लॉगिनवर जा', bn: 'লগইনে যান', ta: 'உள்நுழைவுக்குச் செல்லவும்', te: 'లాగిన్‌కు వెళ్లండి', gu: 'લૉગિન પર જાઓ',
  },
  'auth.newPassword': {
    en: 'New password', hi: 'नया पासवर्ड', mr: 'नवीन पासवर्ड', bn: 'নতুন পাসওয়ার্ড', ta: 'புதிய கடவுச்சொல்', te: 'కొత్త పాస్‌వర్డ్', gu: 'નવો પાસવર્ડ',
  },
  'auth.confirmPassword': {
    en: 'Confirm password', hi: 'पासवर्ड की पुष्टि करें', mr: 'पासवर्डची पुष्टी करा', bn: 'পাসওয়ার্ড নিশ্চিত করুন', ta: 'கடவுச்சொல்லை உறுதிப்படுத்தவும்', te: 'పాస్‌వర్డ్‌ను నిర్ధారించండి', gu: 'પાસવર્ડની પુષ્ટિ કરો',
  },
  'auth.typePasswordAgain': {
    en: 'Type it again', hi: 'दोबारा दर्ज करें', mr: 'पुन्हा टाइप करा', bn: 'আবার লিখুন', ta: 'மீண்டும் உள்ளிடவும்', te: 'మళ్లీ టైప్ చేయండి', gu: 'ફરીથી લખો',
  },
  'auth.updatePassword': {
    en: 'Update Password', hi: 'पासवर्ड अपडेट करें', mr: 'पासवर्ड अपडेट करा', bn: 'পাসওয়ার্ড আপডেট করুন', ta: 'கடவுச்சொல்லைப் புதுப்பிக்கவும்', te: 'పాస్‌వర్డ్‌ను నవీకరించండి', gu: 'પાસવર્ડ અપડેટ કરો',
  },
  'auth.requestNewLink': {
    en: 'Request a new link', hi: 'नया लिंक मांगें', mr: 'नवीन लिंक मागवा', bn: 'নতুন লিঙ্ক চান', ta: 'புதிய இணைப்பைக் கோரவும்', te: 'కొత్త లింక్‌ను అభ్యర్థించండి', gu: 'નવી લિંકની વિનંતી કરો',
  },
  'dashboard.offlineMode': {
    en: 'Offline Mode', hi: 'ऑफ़लाइन मोड', mr: 'ऑफलाइन मोड', bn: 'অফলাইন মোড', ta: 'ஆஃப்லைன் பயன்முறை', te: 'ఆఫ్‌లైన్ మోడ్', gu: 'ઑફલાઇન મોડ',
  },
  'dashboard.savingProgress': {
    en: 'Saving your progress…', hi: 'आपकी प्रगति सहेजी जा रही है…', mr: 'तुमची प्रगती जतन होत आहे…', bn: 'আপনার অগ্রগতি সংরক্ষণ করা হচ্ছে…', ta: 'உங்கள் முன்னேற்றம் சேமிக்கப்படுகிறது…', te: 'మీ ప్రగతి సేవ్ అవుతోంది…', gu: 'તમારી પ્રગતિ સાચવાઈ રહી છે…',
  },
  'dashboard.guestChangesSaved': {
    en: '{{count}} change(s) saved on this device. Log in to back them up.', hi: 'इस डिवाइस पर {{count}} बदलाव सहेजे गए। उनका बैकअप लेने के लिए लॉगिन करें।', mr: 'या डिव्हाइसवर {{count}} बदल जतन केले. बॅकअपसाठी लॉगिन करा.', bn: 'এই ডিভাইসে {{count}}টি পরিবর্তন সংরক্ষিত। ব্যাকআপের জন্য লগ ইন করুন।', ta: 'இந்த சாதனத்தில் {{count}} மாற்றங்கள் சேமிக்கப்பட்டன. காப்புப்பிரதிக்கு உள்நுழையவும்.', te: 'ఈ పరికరంలో {{count}} మార్పులు సేవ్ అయ్యాయి. బ్యాకప్ కోసం లాగిన్ చేయండి.', gu: 'આ ઉપકરણમાં {{count}} ફેરફારો સાચવ્યા. બૅકઅપ માટે લૉગિન કરો.',
  },
  'dashboard.changesWaitingToSync': {
    en: '{{count}} change(s) will sync when you’re online.', hi: 'ऑनलाइन होने पर {{count}} बदलाव सिंक होंगे।', mr: 'ऑनलाइन झाल्यावर {{count}} बदल सिंक होतील.', bn: 'অনলাইনে এলে {{count}}টি পরিবর্তন সিঙ্ক হবে।', ta: 'ஆன்லைனில் இருக்கும்போது {{count}} மாற்றங்கள் ஒத்திசைக்கப்படும்.', te: 'ఆన్‌లైన్‌లో ఉన్నప్పుడు {{count}} మార్పులు సింక్ అవుతాయి.', gu: 'ઓનલાઇન હો ત્યારે {{count}} ફેરફારો સિંક થશે.',
  },
  'dashboard.logInToBackUp': {
    en: 'Log in to back up your progress.', hi: 'अपनी प्रगति का बैकअप लेने के लिए लॉगिन करें।', mr: 'प्रगतीचा बॅकअप घेण्यासाठी लॉगिन करा.', bn: 'অগ্রগতির ব্যাকআপ নিতে লগ ইন করুন।', ta: 'முன்னேற்றத்தை காப்புப்பிரதி எடுக்க உள்நுழையவும்.', te: 'మీ ప్రగతిని బ్యాకప్ చేయడానికి లాగిన్ చేయండి.', gu: 'પ્રગતિનો બૅકઅપ લેવા લૉગિન કરો.',
  },
  'dashboard.progressBackedUp': {
    en: 'Your progress is backed up.', hi: 'आपकी प्रगति का बैकअप हो गया है।', mr: 'तुमच्या प्रगतीचा बॅकअप घेतला आहे.', bn: 'আপনার অগ্রগতির ব্যাকআপ নেওয়া হয়েছে।', ta: 'உங்கள் முன்னேற்றம் காப்புப்பிரதி எடுக்கப்பட்டது.', te: 'మీ ప్రగతి బ్యాకప్ చేయబడింది.', gu: 'તમારી પ્રગતિનો બૅકઅપ લેવાયો છે.',
  },
  'dashboard.learningWithoutInternet': {
    en: 'Your learning continues without internet.', hi: 'आपकी पढ़ाई बिना इंटरनेट के जारी रहती है।', mr: 'इंटरनेटशिवाय तुमचे शिक्षण सुरू राहते.', bn: 'ইন্টারনেট ছাড়াই আপনার শেখা চলতে থাকবে।', ta: 'இணையம் இல்லாமலும் உங்கள் கற்றல் தொடரும்.', te: 'ఇంటర్నెట్ లేకపోయినా మీ అభ్యాసం కొనసాగుతుంది.', gu: 'ઇન્ટરનેટ વિના પણ તમારો અભ્યાસ ચાલુ રહે છે.',
  },
  'dashboard.greetingWithName': {
    en: 'Hello, {{name}} 👋', hi: 'नमस्ते, {{name}} 👋', mr: 'नमस्कार, {{name}} 👋', bn: 'হ্যালো, {{name}} 👋', ta: 'வணக்கம், {{name}} 👋', te: 'హలో, {{name}} 👋', gu: 'નમસ્તે, {{name}} 👋',
  },
  'dashboard.greeting': {
    en: 'Hello 👋', hi: 'नमस्ते 👋', mr: 'नमस्कार 👋', bn: 'হ্যালো 👋', ta: 'வணக்கம் 👋', te: 'హలో 👋', gu: 'નમસ્તે 👋',
  },
  'dashboard.startStarterBundle': {
    en: 'Start with the Starter Bundle', hi: 'स्टार्टर बंडल से शुरू करें', mr: 'स्टार्टर बंडलपासून सुरुवात करा', bn: 'স্টার্টার বান্ডেল দিয়ে শুরু করুন', ta: 'ஸ்டார்டர் தொகுப்புடன் தொடங்கவும்', te: 'స్టార్టర్ బండిల్‌తో ప్రారంభించండి', gu: 'સ્ટાર્ટર બંડલથી શરૂ કરો',
  },
  'dashboard.continueLesson': {
    en: 'Continue: {{title}}', hi: 'जारी रखें: {{title}}', mr: 'पुढे सुरू ठेवा: {{title}}', bn: 'চালিয়ে যান: {{title}}', ta: 'தொடரவும்: {{title}}', te: 'కొనసాగించండి: {{title}}', gu: 'ચાલુ રાખો: {{title}}',
  },
  'dashboard.continueWhereLeftOff': {
    en: 'Continue where you left off', hi: 'जहां छोड़ा था वहीं से जारी रखें', mr: 'जिथे थांबला होता तिथून पुढे सुरू ठेवा', bn: 'যেখানে ছেড়েছিলেন সেখান থেকে চালিয়ে যান', ta: 'நிறுத்திய இடத்திலிருந்து தொடரவும்', te: 'మీరు ఆపిన చోటు నుండి కొనసాగించండి', gu: 'જ્યાંથી છોડ્યું હતું ત્યાંથી ચાલુ રાખો',
  },
  'dashboard.sampleLessonsOffline': {
    en: 'Sample lessons from 5 subjects, available offline', hi: '5 विषयों के नमूना पाठ, ऑफ़लाइन उपलब्ध', mr: '5 विषयांतील नमुना धडे, ऑफलाइन उपलब्ध', bn: '৫টি বিষয়ের নমুনা পাঠ, অফলাইনে উপলব্ধ', ta: '5 பாடங்களின் மாதிரி பாடங்கள், ஆஃப்லைனில் கிடைக்கும்', te: '5 విషయాల నమూనా పాఠాలు, ఆఫ్‌లైన్‌లో అందుబాటులో ఉన్నాయి', gu: '5 વિષયોના નમૂના પાઠ, ઑફલાઇન ઉપલબ્ધ',
  },
  'dashboard.percentCompleted': {
    en: '{{percent}}% completed', hi: '{{percent}}% पूरा', mr: '{{percent}}% पूर्ण', bn: '{{percent}}% সম্পন্ন', ta: '{{percent}}% முடிந்தது', te: '{{percent}}% పూర్తయింది', gu: '{{percent}}% પૂર્ણ',
  },
  'dashboard.browseCourses': {
    en: 'Browse courses and learning packs', hi: 'कोर्स और लर्निंग पैक देखें', mr: 'कोर्स आणि लर्निंग पॅक पाहा', bn: 'কোর্স ও লার্নিং প্যাক দেখুন', ta: 'கோர்ஸ்கள் மற்றும் கற்றல் தொகுப்புகளைப் பாருங்கள்', te: 'కోర్సులు మరియు లెర్నింగ్ ప్యాక్‌లను చూడండి', gu: 'કોર્સ અને લર્નિંગ પૅક જુઓ',
  },
  'dashboard.scholarshipDescription': {
    en: 'Discover opportunities matching your profile', hi: 'अपनी प्रोफ़ाइल के अनुसार अवसर खोजें', mr: 'तुमच्या प्रोफाइलशी जुळणाऱ्या संधी शोधा', bn: 'আপনার প্রোফাইলের সঙ্গে মানানসই সুযোগ খুঁজুন', ta: 'உங்கள் சுயவிவரத்திற்குப் பொருந்தும் வாய்ப்புகளைக் கண்டறியவும்', te: 'మీ ప్రొఫైల్‌కు సరిపోయే అవకాశాలను కనుగొనండి', gu: 'તમારી પ્રોફાઇલને અનુરૂપ તકો શોધો',
  },
  'dashboard.learningContinues': {
    en: 'Learning continues', hi: 'सीखना जारी रहता है', mr: 'शिकणे सुरूच राहते', bn: 'শেখা চলতে থাকে', ta: 'கற்றல் தொடர்கிறது', te: 'అభ్యాసం కొనసాగుతుంది', gu: 'શીખવાનું ચાલુ રહે છે',
  },
  'dashboard.progressSavedLocally': {
    en: 'Your progress is saved on this device and can sync when you’re back online.', hi: 'आपकी प्रगति इस डिवाइस पर सहेजी जाती है और ऑनलाइन होने पर सिंक हो जाएगी।', mr: 'तुमची प्रगती या डिव्हाइसवर जतन होते आणि ऑनलाइन आल्यावर सिंक होईल.', bn: 'আপনার অগ্রগতি এই ডিভাইসে সংরক্ষিত হয় এবং অনলাইনে এলে সিঙ্ক হবে।', ta: 'உங்கள் முன்னேற்றம் இந்த சாதனத்தில் சேமிக்கப்படும்; ஆன்லைனுக்கு வந்ததும் ஒத்திசைக்கப்படும்.', te: 'మీ ప్రగతి ఈ పరికరంలో సేవ్ అవుతుంది; ఆన్‌లైన్‌కు వచ్చినప్పుడు సింక్ అవుతుంది.', gu: 'તમારી પ્રગતિ આ ઉપકરણમાં સાચવાય છે અને ઓનલાઇન થતાં સિંક થશે.',
  },
  'dashboard.logInOrCreateAccount': {
    en: 'Log in or create an account', hi: 'लॉगिन करें या अकाउंट बनाएं', mr: 'लॉगिन करा किंवा खाते तयार करा', bn: 'লগ ইন করুন বা অ্যাকাউন্ট তৈরি করুন', ta: 'உள்நுழையவும் அல்லது கணக்கை உருவாக்கவும்', te: 'లాగిన్ చేయండి లేదా ఖాతా సృష్టించండి', gu: 'લૉગિન કરો અથવા ખાતું બનાવો',
  },
  'courseList.downloaded': {
    en: 'Downloaded', hi: 'डाउनलोड किए गए', mr: 'डाउनलोड केलेले', bn: 'ডাউনলোড করা', ta: 'பதிவிறக்கம் செய்தவை', te: 'డౌన్‌లోడ్ చేసినవి', gu: 'ડાઉનલોડ કરેલ',
  },
  'courseList.availableOffline': {
    en: 'Available Offline', hi: 'ऑफ़लाइन उपलब्ध', mr: 'ऑफलाइन उपलब्ध', bn: 'অফলাইনে উপলব্ধ', ta: 'ஆஃப்லைனில் கிடைக்கும்', te: 'ఆఫ్‌లైన్‌లో అందుబాటులో ఉంది', gu: 'ઑફલાઇન ઉપલબ્ધ',
  },
  'courseList.starterBundle': {
    en: 'Starter Bundle', hi: 'स्टार्टर बंडल', mr: 'स्टार्टर बंडल', bn: 'স্টার্টার বান্ডেল', ta: 'ஸ்டார்டர் தொகுப்பு', te: 'స్టార్టర్ బండిల్', gu: 'સ્ટાર્ટર બંડલ',
  },
  'courseList.exploreWithoutAccount': {
    en: 'Explore courses without an account', hi: 'बिना अकाउंट के कोर्स देखें', mr: 'खात्याशिवाय कोर्स पाहा', bn: 'অ্যাকাউন্ট ছাড়াই কোর্স দেখুন', ta: 'கணக்கு இல்லாமல் கோர்ஸ்களைப் பாருங்கள்', te: 'ఖాతా లేకుండా కోర్సులను చూడండి', gu: 'ખાતા વિના કોર્સ જુઓ',
  },
  'courseList.bundleMetadata': {
    en: '{{count}} sample courses • Demo lessons • Demo quizzes • Offline', hi: '{{count}} नमूना कोर्स • डेमो पाठ • डेमो क्विज़ • ऑफ़लाइन', mr: '{{count}} नमुना कोर्स • डेमो धडे • डेमो क्विझ • ऑफलाइन', bn: '{{count}}টি নমুনা কোর্স • ডেমো পাঠ • ডেমো কুইজ • অফলাইন', ta: '{{count}} மாதிரி கோர்ஸ்கள் • டெமோ பாடங்கள் • டெமோ வினாடி வினா • ஆஃப்லைன்', te: '{{count}} నమూనా కోర్సులు • డెమో పాఠాలు • డెమో క్విజ్‌లు • ఆఫ్‌లైన్', gu: '{{count}} નમૂના કોર્સ • ડેમો પાઠ • ડેમો ક્વિઝ • ઑફલાઇન',
  },
  'courseList.allCourses': {
    en: 'All Courses', hi: 'सभी कोर्स', mr: 'सर्व कोर्स', bn: 'সব কোর্স', ta: 'அனைத்து கோர்ஸ்கள்', te: 'అన్ని కోర్సులు', gu: 'બધા કોર્સ',
  },
  'courseList.courseCount': {
    en: '{{count}} courses', hi: '{{count}} कोर्स', mr: '{{count}} कोर्स', bn: '{{count}}টি কোর্স', ta: '{{count}} கோர்ஸ்கள்', te: '{{count}} కోర్సులు', gu: '{{count}} કોર્સ',
  },
  'courseList.courseMetadata': {
    en: '{{count}} lessons • {{size}}', hi: '{{count}} पाठ • {{size}}', mr: '{{count}} धडे • {{size}}', bn: '{{count}}টি পাঠ • {{size}}', ta: '{{count}} பாடங்கள் • {{size}}', te: '{{count}} పాఠాలు • {{size}}', gu: '{{count}} પાઠ • {{size}}',
  },
  'courseList.percentDone': {
    en: '{{percent}}% done', hi: '{{percent}}% पूरा', mr: '{{percent}}% पूर्ण', bn: '{{percent}}% সম্পন্ন', ta: '{{percent}}% முடிந்தது', te: '{{percent}}% పూర్తయింది', gu: '{{percent}}% પૂર્ણ',
  },
  'courseList.savedCoursesOffline': {
    en: "You're offline. Showing saved courses.", hi: 'आप ऑफ़लाइन हैं। सहेजे गए कोर्स दिखाए जा रहे हैं।', mr: 'तुम्ही ऑफलाइन आहात. जतन केलेले कोर्स दाखवत आहोत.', bn: 'আপনি অফলাইনে আছেন। সংরক্ষিত কোর্স দেখানো হচ্ছে।', ta: 'நீங்கள் ஆஃப்லைனில் உள்ளீர்கள். சேமித்த கோர்ஸ்கள் காட்டப்படுகின்றன.', te: 'మీరు ఆఫ్‌లైన్‌లో ఉన్నారు. సేవ్ చేసిన కోర్సులు చూపబడుతున్నాయి.', gu: 'તમે ઑફલાઇન છો. સાચવેલા કોર્સ બતાવીએ છીએ.',
  },
  'courseList.couldNotRefresh': {
    en: 'Could not refresh courses.', hi: 'कोर्स रीफ़्रेश नहीं हो सके।', mr: 'कोर्स रिफ्रेश करता आले नाहीत.', bn: 'কোর্স রিফ্রেশ করা যায়নি।', ta: 'கோர்ஸ்களைப் புதுப்பிக்க முடியவில்லை.', te: 'కోర్సులను రిఫ్రెష్ చేయలేకపోయాము.', gu: 'કોર્સ રિફ્રેશ કરી શકાયા નહીં.',
  },
  'courseList.noDownloads': {
    en: 'No downloaded courses yet. Open a course and tap Download to learn offline.', hi: 'अभी कोई कोर्स डाउनलोड नहीं है। कोर्स खोलें और ऑफ़लाइन सीखने के लिए डाउनलोड करें।', mr: 'अद्याप कोर्स डाउनलोड केलेले नाहीत. कोर्स उघडा आणि ऑफलाइन शिकण्यासाठी डाउनलोड करा.', bn: 'এখনও কোনো কোর্স ডাউনলোড করা হয়নি। অফলাইনে শিখতে কোর্স খুলে ডাউনলোড করুন।', ta: 'இன்னும் கோர்ஸ்கள் பதிவிறக்கப்படவில்லை. ஆஃப்லைனில் கற்க கோர்ஸைத் திறந்து பதிவிறக்கவும்.', te: 'ఇంకా కోర్సులు డౌన్‌లోడ్ కాలేదు. ఆఫ్‌లైన్‌లో నేర్చుకోవడానికి కోర్సును తెరిచి డౌన్‌లోడ్ చేయండి.', gu: 'હજુ સુધી કોઈ કોર્સ ડાઉનલોડ નથી. ઑફલાઇન શીખવા કોર્સ ખોલો અને ડાઉનલોડ કરો.',
  },
  'courseList.empty': {
    en: 'Nothing here yet.', hi: 'अभी यहां कुछ नहीं है।', mr: 'अजून येथे काही नाही.', bn: 'এখানে এখনও কিছু নেই।', ta: 'இங்கே இன்னும் எதுவும் இல்லை.', te: 'ఇక్కడ ఇంకా ఏమీ లేదు.', gu: 'અહીં હજી કંઈ નથી.',
  },
  'courseList.connectToSeeAll': {
    en: 'Connect to the internet once to see all courses. The Starter Bundle above works offline.', hi: 'सभी कोर्स देखने के लिए एक बार इंटरनेट से जुड़ें। ऊपर दिया स्टार्टर बंडल ऑफ़लाइन काम करता है।', mr: 'सर्व कोर्स पाहण्यासाठी एकदा इंटरनेटशी जोडा. वरील स्टार्टर बंडल ऑफलाइन चालते.', bn: 'সব কোর্স দেখতে একবার ইন্টারনেটে সংযোগ করুন। উপরের স্টার্টার বান্ডেল অফলাইনে চলে।', ta: 'அனைத்து கோர்ஸ்களையும் பார்க்க ஒருமுறை இணையத்துடன் இணைக்கவும். மேலே உள்ள ஸ்டார்டர் தொகுப்பு ஆஃப்லைனில் இயங்கும்.', te: 'అన్ని కోర్సులను చూడటానికి ఒకసారి ఇంటర్నెట్‌కు కనెక్ట్ చేయండి. పైన ఉన్న స్టార్టర్ బండిల్ ఆఫ్‌లైన్‌లో పనిచేస్తుంది.', gu: 'બધા કોર્સ જોવા માટે એકવાર ઇન્ટરનેટ સાથે જોડાઓ. ઉપરનું સ્ટાર્ટર બંડલ ઑફલાઇન ચાલે છે.',
  },
  'offline.title': {
    en: 'Offline Learning', hi: 'ऑफ़लाइन सीखना', mr: 'ऑफलाइन शिक्षण', bn: 'অফলাইন শেখা', ta: 'ஆஃப்லைன் கற்றல்', te: 'ఆఫ్‌లైన్ అభ్యాసం', gu: 'ઑફલાઇન અભ્યાસ',
  },
  'offline.subtitle': {
    en: 'Your learning continues', hi: 'आपका सीखना जारी रहता है', mr: 'तुमचे शिक्षण सुरूच राहते', bn: 'আপনার শেখা চলতে থাকে', ta: 'உங்கள் கற்றல் தொடர்கிறது', te: 'మీ అభ్యాసం కొనసాగుతుంది', gu: 'તમારો અભ્યાસ ચાલુ રહે છે',
  },
  'offline.starterPack': {
    en: 'Starter Learning Pack', hi: 'स्टार्टर लर्निंग पैक', mr: 'स्टार्टर लर्निंग पॅक', bn: 'স্টার্টার লার্নিং প্যাক', ta: 'ஸ்டார்டர் கற்றல் தொகுப்பு', te: 'స్టార్టర్ లెర్నింగ్ ప్యాక్', gu: 'સ્ટાર્ટર લર્નિંગ પૅક',
  },
  'offline.downloadedMaterial': {
    en: 'Your downloaded learning material is available even without internet.', hi: 'आपकी डाउनलोड की गई अध्ययन सामग्री इंटरनेट के बिना भी उपलब्ध है।', mr: 'डाउनलोड केलेली अध्ययन सामग्री इंटरनेटशिवायही उपलब्ध आहे.', bn: 'ডাউনলোড করা শেখার উপকরণ ইন্টারনেট ছাড়াও পাওয়া যায়।', ta: 'பதிவிறக்கம் செய்த கற்றல் பொருட்கள் இணையம் இல்லாமலும் கிடைக்கும்.', te: 'డౌన్‌లోడ్ చేసిన అభ్యాస సామగ్రి ఇంటర్నెట్ లేకుండానే అందుబాటులో ఉంటుంది.', gu: 'ડાઉનલોડ કરેલી અભ્યાસ સામગ્રી ઇન્ટરનેટ વિના પણ ઉપલબ્ધ છે.',
  },
  'offline.currentCourse': {
    en: 'Your current course', hi: 'आपका वर्तमान कोर्स', mr: 'तुमचा सध्याचा कोर्स', bn: 'আপনার বর্তমান কোর্স', ta: 'உங்கள் தற்போதைய கோர்ஸ்', te: 'మీ ప్రస్తుత కోర్సు', gu: 'તમારો વર્તમાન કોર્સ',
  },
  'offline.sampleSubjectCount': {
    en: 'Sample lessons from 5 subjects', hi: '5 विषयों के नमूना पाठ', mr: '5 विषयांतील नमुना धडे', bn: '৫টি বিষয়ের নমুনা পাঠ', ta: '5 பாடங்களின் மாதிரி பாடங்கள்', te: '5 విషయాల నమూనా పాఠాలు', gu: '5 વિષયોના નમૂના પાઠ',
  },
  'offline.learningProgress': {
    en: 'Learning progress', hi: 'सीखने की प्रगति', mr: 'शिकण्याची प्रगती', bn: 'শেখার অগ্রগতি', ta: 'கற்றல் முன்னேற்றம்', te: 'అభ్యాస ప్రగతి', gu: 'અભ્યાસની પ્રગતિ',
  },
  'offline.lessonQuizAi': {
    en: 'Lessons • Quizzes • Offline AI', hi: 'पाठ • क्विज़ • ऑफ़लाइन AI', mr: 'धडे • क्विझ • ऑफलाइन AI', bn: 'পাঠ • কুইজ • অফলাইন AI', ta: 'பாடங்கள் • வினாடி வினா • ஆஃப்லைன் AI', te: 'పాఠాలు • క్విజ్‌లు • ఆఫ్‌లైన్ AI', gu: 'પાઠ • ક્વિઝ • ઑફલાઇન AI',
  },
  'offline.openStarter': {
    en: 'Open the Starter Bundle', hi: 'स्टार्टर बंडल खोलें', mr: 'स्टार्टर बंडल उघडा', bn: 'স্টার্টার বান্ডেল খুলুন', ta: 'ஸ்டார்டர் தொகுப்பைத் திறக்கவும்', te: 'స్టార్టర్ బండిల్‌ను తెరవండి', gu: 'સ્ટાર્ટર બંડલ ખોલો',
  },
  'offline.readLessons': {
    en: 'Read downloaded lessons', hi: 'डाउनलोड किए गए पाठ पढ़ें', mr: 'डाउनलोड केलेले धडे वाचा', bn: 'ডাউনলোড করা পাঠ পড়ুন', ta: 'பதிவிறக்கம் செய்த பாடங்களைப் படிக்கவும்', te: 'డౌన్‌లోడ్ చేసిన పాఠాలను చదవండి', gu: 'ડાઉનલોડ કરેલા પાઠ વાંચો',
  },
  'offline.practiceNoInternet': {
    en: 'Practice without internet', hi: 'इंटरनेट के बिना अभ्यास करें', mr: 'इंटरनेटशिवाय सराव करा', bn: 'ইন্টারনেট ছাড়া অনুশীলন করুন', ta: 'இணையம் இல்லாமல் பயிற்சி செய்யவும்', te: 'ఇంటర్నెట్ లేకుండా సాధన చేయండి', gu: 'ઇન્ટરનેટ વિના અભ્યાસ કરો',
  },
  'offline.askDownloaded': {
    en: 'Ask about downloaded content', hi: 'डाउनलोड की गई सामग्री के बारे में पूछें', mr: 'डाउनलोड केलेल्या सामग्रीबद्दल विचारा', bn: 'ডাউনলোড করা বিষয়বস্তু সম্পর্কে জিজ্ঞাসা করুন', ta: 'பதிவிறக்கம் செய்த உள்ளடக்கத்தைப் பற்றி கேளுங்கள்', te: 'డౌన్‌లోడ్ చేసిన కంటెంట్ గురించి అడగండి', gu: 'ડાઉનલોડ કરેલી સામગ્રી વિશે પૂછો',
  },
  'offline.trackProgress': {
    en: 'Track your local progress', hi: 'अपनी स्थानीय प्रगति देखें', mr: 'तुमची स्थानिक प्रगती पाहा', bn: 'আপনার স্থানীয় অগ্রগতি দেখুন', ta: 'உங்கள் உள்ளூர் முன்னேற்றத்தைக் கண்காணிக்கவும்', te: 'మీ స్థానిక ప్రగతిని ట్రాక్ చేయండి', gu: 'તમારી સ્થાનિક પ્રગતિ જુઓ',
  },
  'offline.learningOffline': {
    en: 'You’re learning offline', hi: 'आप ऑफ़लाइन सीख रहे हैं', mr: 'तुम्ही ऑफलाइन शिकत आहात', bn: 'আপনি অফলাইনে শিখছেন', ta: 'நீங்கள் ஆஃப்லைனில் கற்றுக்கொள்கிறீர்கள்', te: 'మీరు ఆఫ్‌లైన్‌లో నేర్చుకుంటున్నారు', gu: 'તમે ઑફલાઇન શીખી રહ્યા છો',
  },
  'offline.progressWillSync': {
    en: 'Your progress will be saved on this device and can be synchronized when you reconnect.', hi: 'आपकी प्रगति इस डिवाइस पर सहेजी जाएगी और दोबारा जुड़ने पर सिंक हो जाएगी।', mr: 'तुमची प्रगती या डिव्हाइसवर जतन होईल आणि पुन्हा कनेक्ट झाल्यावर सिंक होईल.', bn: 'আপনার অগ্রগতি এই ডিভাইসে সংরক্ষিত হবে এবং পুনরায় সংযোগ করলে সিঙ্ক হবে।', ta: 'உங்கள் முன்னேற்றம் இந்த சாதனத்தில் சேமிக்கப்படும்; மீண்டும் இணைக்கும்போது ஒத்திசைக்கப்படும்.', te: 'మీ ప్రగతి ఈ పరికరంలో సేవ్ అవుతుంది; మళ్లీ కనెక్ట్ అయినప్పుడు సింక్ అవుతుంది.', gu: 'તમારી પ્રગતિ આ ઉપકરણમાં સાચવાશે અને ફરી જોડાશો ત્યારે સિંક થશે.',
  },
  'offline.availableOffline': {
    en: 'Available Offline', hi: 'ऑफ़लाइन उपलब्ध', mr: 'ऑफलाइन उपलब्ध', bn: 'অফলাইনে উপলব্ধ', ta: 'ஆஃப்லைனில் கிடைக்கும்', te: 'ఆఫ్‌లైన్‌లో అందుబాటులో ఉంది', gu: 'ઑફલાઇન ઉપલબ્ધ',
  },
  'offline.lessons': {
    en: 'Lessons', hi: 'पाठ', mr: 'धडे', bn: 'পাঠ', ta: 'பாடங்கள்', te: 'పాఠాలు', gu: 'પાઠ',
  },
  'offline.myProgress': {
    en: 'My Progress', hi: 'मेरी प्रगति', mr: 'माझी प्रगती', bn: 'আমার অগ্রগতি', ta: 'எனது முன்னேற்றம்', te: 'నా ప్రగతి', gu: 'મારી પ્રગતિ',
  },
  'starter.welcome': {
    en: 'Welcome to the Starter Bundle', hi: 'स्टार्टर बंडल में आपका स्वागत है', mr: 'स्टार्टर बंडलमध्ये तुमचे स्वागत आहे', bn: 'স্টার্টার বান্ডেলে স্বাগতম', ta: 'ஸ்டார்டர் தொகுப்பிற்கு வரவேற்கிறோம்', te: 'స్టార్టర్ బండిల్‌కు స్వాగతం', gu: 'સ્ટાર્ટર બંડલમાં તમારું સ્વાગત છે',
  },
  'starter.description': {
    en: 'Explore sample lessons and demo quizzes from different subjects — no login required.', hi: 'बिना लॉगिन के अलग-अलग विषयों के नमूना पाठ और डेमो क्विज़ देखें।', mr: 'लॉगिनशिवाय विविध विषयांतील नमुना धडे आणि डेमो क्विझ पाहा.', bn: 'লগ ইন ছাড়াই বিভিন্ন বিষয়ের নমুনা পাঠ ও ডেমো কুইজ দেখুন।', ta: 'உள்நுழையாமல் பல்வேறு பாடங்களின் மாதிரி பாடங்கள் மற்றும் டெமோ வினாடி வினாக்களைப் பாருங்கள்.', te: 'లాగిన్ లేకుండా వివిధ విషయాల నమూనా పాఠాలు మరియు డెమో క్విజ్‌లను చూడండి.', gu: 'લૉગિન વિના વિવિધ વિષયોના નમૂના પાઠ અને ડેમો ક્વિઝ જુઓ.',
  },
  'starter.availableOffline': {
    en: 'Starter content available offline', hi: 'स्टार्टर सामग्री ऑफ़लाइन उपलब्ध है', mr: 'स्टार्टर सामग्री ऑफलाइन उपलब्ध आहे', bn: 'স্টার্টার বিষয়বস্তু অফলাইনে উপলব্ধ', ta: 'ஸ்டார்டர் உள்ளடக்கம் ஆஃப்லைனில் கிடைக்கும்', te: 'స్టార్టర్ కంటెంట్ ఆఫ్‌లైన్‌లో అందుబాటులో ఉంది', gu: 'સ્ટાર્ટર સામગ્રી ઑફલાઇન ઉપલબ્ધ છે',
  },
  'starter.exploreCourses': {
    en: 'Explore Courses', hi: 'कोर्स देखें', mr: 'कोर्स पाहा', bn: 'কোর্স দেখুন', ta: 'கோர்ஸ்களை ஆராயுங்கள்', te: 'కోర్సులను చూడండి', gu: 'કોર્સ જુઓ',
  },
  'starter.chooseSubject': {
    en: 'Choose a subject to start learning', hi: 'सीखना शुरू करने के लिए विषय चुनें', mr: 'शिकायला सुरुवात करण्यासाठी विषय निवडा', bn: 'শেখা শুরু করতে একটি বিষয় বেছে নিন', ta: 'கற்கத் தொடங்க ஒரு பாடத்தைத் தேர்ந்தெடுக்கவும்', te: 'నేర్చుకోవడం ప్రారంభించడానికి ఒక విషయాన్ని ఎంచుకోండి', gu: 'શીખવાનું શરૂ કરવા વિષય પસંદ કરો',
  },
  'starter.courseCount': {
    en: '{{count}} courses', hi: '{{count}} कोर्स', mr: '{{count}} कोर्स', bn: '{{count}}টি কোর্স', ta: '{{count}} கோர்ஸ்கள்', te: '{{count}} కోర్సులు', gu: '{{count}} કોર્સ',
  },
  'starter.demoLessonCount': {
    en: '{{count}} demo lesson(s)', hi: '{{count}} डेमो पाठ', mr: '{{count}} डेमो धडे', bn: '{{count}}টি ডেমো পাঠ', ta: '{{count}} டெமோ பாடங்கள்', te: '{{count}} డెమో పాఠాలు', gu: '{{count}} ડેમો પાઠ',
  },
  'starter.demoQuiz': {
    en: 'Demo quiz', hi: 'डेमो क्विज़', mr: 'डेमो क्विझ', bn: 'ডেমো কুইজ', ta: 'டெமோ வினாடி வினா', te: 'డెమో క్విజ్', gu: 'ડેમો ક્વિઝ',
  },
  'quiz.title': {
    en: 'Take Quiz', hi: 'क्विज़ लें', mr: 'क्विझ सोडवा', bn: 'কুইজ দিন', ta: 'வினாடி வினா எடுக்கவும்', te: 'క్విజ్ తీసుకోండి', gu: 'ક્વિઝ આપો',
  },
  'quiz.practiceOffline': {
    en: 'Practice offline', hi: 'ऑफ़लाइन अभ्यास करें', mr: 'ऑफलाइन सराव करा', bn: 'অফলাইনে অনুশীলন করুন', ta: 'ஆஃப்லைனில் பயிற்சி செய்யவும்', te: 'ఆఫ్‌లైన్‌లో సాధన చేయండి', gu: 'ઑફલાઇન અભ્યાસ કરો',
  },
  'quiz.empty': {
    en: 'No quizzes on this phone yet. Download a course to get its quizzes.', hi: 'इस फोन पर अभी कोई क्विज़ नहीं है। क्विज़ पाने के लिए कोर्स डाउनलोड करें।', mr: 'या फोनवर अजून क्विझ नाहीत. क्विझ मिळवण्यासाठी कोर्स डाउनलोड करा.', bn: 'এই ফোনে এখনও কোনো কুইজ নেই। কুইজ পেতে একটি কোর্স ডাউনলোড করুন।', ta: 'இந்த போனில் இன்னும் வினாடி வினாக்கள் இல்லை. அவற்றைப் பெற கோர்ஸைப் பதிவிறக்கவும்.', te: 'ఈ ఫోన్‌లో ఇంకా క్విజ్‌లు లేవు. వాటి కోసం కోర్సును డౌన్‌లోడ్ చేయండి.', gu: 'આ ફોનમાં હજી ક્વિઝ નથી. ક્વિઝ મેળવવા કોર્સ ડાઉનલોડ કરો.',
  },
  'quiz.questionCount': {
    en: '{{count}} questions', hi: '{{count}} प्रश्न', mr: '{{count}} प्रश्न', bn: '{{count}}টি প্রশ্ন', ta: '{{count}} கேள்விகள்', te: '{{count}} ప్రశ్నలు', gu: '{{count}} પ્રશ્નો',
  },
  'quiz.bestScore': {
    en: 'Best {{score}}/{{total}}', hi: 'सर्वश्रेष्ठ {{score}}/{{total}}', mr: 'सर्वोत्तम {{score}}/{{total}}', bn: 'সেরা {{score}}/{{total}}', ta: 'சிறந்தது {{score}}/{{total}}', te: 'ఉత్తమం {{score}}/{{total}}', gu: 'શ્રેષ્ઠ {{score}}/{{total}}',
  },
  'quiz.unavailable': {
    en: 'Quiz not available', hi: 'क्विज़ उपलब्ध नहीं है', mr: 'क्विझ उपलब्ध नाही', bn: 'কুইজ উপলব্ধ নয়', ta: 'வினாடி வினா கிடைக்கவில்லை', te: 'క్విజ్ అందుబాటులో లేదు', gu: 'ક્વિઝ ઉપલબ્ધ નથી',
  },
  'quiz.downloadToPlay': {
    en: 'Download the course to take this quiz offline.', hi: 'इस क्विज़ को ऑफ़लाइन लेने के लिए कोर्स डाउनलोड करें।', mr: 'ही क्विझ ऑफलाइन सोडवण्यासाठी कोर्स डाउनलोड करा.', bn: 'অফলাইনে এই কুইজ দিতে কোর্সটি ডাউনলোড করুন।', ta: 'இந்த வினாடி வினாவை ஆஃப்லைனில் எடுக்க கோர்ஸைப் பதிவிறக்கவும்.', te: 'ఈ క్విజ్‌ను ఆఫ్‌లైన్‌లో తీసుకోవడానికి కోర్సును డౌన్‌లోడ్ చేయండి.', gu: 'આ ક્વિઝ ઑફલાઇન આપવા કોર્સ ડાઉનલોડ કરો.',
  },
  'quiz.completed': {
    en: 'Quiz Completed', hi: 'क्विज़ पूरी हुई', mr: 'क्विझ पूर्ण झाली', bn: 'কুইজ সম্পন্ন', ta: 'வினாடி வினா முடிந்தது', te: 'క్విజ్ పూర్తయింది', gu: 'ક્વિઝ પૂર્ણ થઈ',
  },
  'quiz.resultSynced': {
    en: 'Your result is saved and will sync to your account.', hi: 'आपका परिणाम सहेजा गया है और अकाउंट से सिंक होगा।', mr: 'तुमचा निकाल जतन झाला असून खात्याशी सिंक होईल.', bn: 'আপনার ফলাফল সংরক্ষিত হয়েছে এবং অ্যাকাউন্টে সিঙ্ক হবে।', ta: 'உங்கள் முடிவு சேமிக்கப்பட்டு கணக்குடன் ஒத்திசைக்கப்படும்.', te: 'మీ ఫలితం సేవ్ అయింది, ఖాతాకు సింక్ అవుతుంది.', gu: 'તમારું પરિણામ સાચવાયું છે અને ખાતા સાથે સિંક થશે.',
  },
  'quiz.resultLocal': {
    en: 'Your result is saved on this phone.', hi: 'आपका परिणाम इस फोन पर सहेजा गया है।', mr: 'तुमचा निकाल या फोनवर जतन केला आहे.', bn: 'আপনার ফলাফল এই ফোনে সংরক্ষিত হয়েছে।', ta: 'உங்கள் முடிவு இந்த போனில் சேமிக்கப்பட்டுள்ளது.', te: 'మీ ఫలితం ఈ ఫోన్‌లో సేవ్ అయింది.', gu: 'તમારું પરિણામ આ ફોનમાં સાચવાયું છે.',
  },
  'quiz.yourScore': {
    en: 'Your Score', hi: 'आपका स्कोर', mr: 'तुमचा गुण', bn: 'আপনার স্কোর', ta: 'உங்கள் மதிப்பெண்', te: 'మీ స్కోర్', gu: 'તમારો સ્કોર',
  },
  'quiz.savedOffline': {
    en: '● Saved Offline', hi: '● ऑफ़लाइन सहेजा गया', mr: '● ऑफलाइन जतन केले', bn: '● অফলাইনে সংরক্ষিত', ta: '● ஆஃப்லைனில் சேமிக்கப்பட்டது', te: '● ఆఫ్‌లైన్‌లో సేవ్ అయింది', gu: '● ઑફલાઇન સાચવ્યું',
  },
  'quiz.correct': {
    en: 'Correct: {{answer}}', hi: 'सही उत्तर: {{answer}}', mr: 'योग्य उत्तर: {{answer}}', bn: 'সঠিক উত্তর: {{answer}}', ta: 'சரியான பதில்: {{answer}}', te: 'సరైన సమాధానం: {{answer}}', gu: 'સાચો જવાબ: {{answer}}',
  },
  'quiz.backToDashboard': {
    en: 'Back to Dashboard', hi: 'डैशबोर्ड पर वापस जाएं', mr: 'डॅशबोर्डवर परत जा', bn: 'ড্যাশবোর্ডে ফিরে যান', ta: 'டாஷ்போர்டுக்குத் திரும்பு', te: 'డ్యాష్‌బోర్డ్‌కు తిరిగి వెళ్ళండి', gu: 'ડૅશબોર્ડ પર પાછા જાઓ',
  },
  'quiz.offlineMode': {
    en: 'Offline Mode', hi: 'ऑफ़लाइन मोड', mr: 'ऑफलाइन मोड', bn: 'অফলাইন মোড', ta: 'ஆஃப்லைன் பயன்முறை', te: 'ఆఫ్‌లైన్ మోడ్', gu: 'ઑફલાઇન મોડ',
  },
  'quiz.offlineBanner': {
    en: 'Offline quiz • Your answers are saved locally', hi: 'ऑफ़लाइन क्विज़ • आपके जवाब स्थानीय रूप से सहेजे जाते हैं', mr: 'ऑफलाइन क्विझ • तुमची उत्तरे स्थानिकरित्या जतन होतात', bn: 'অফলাইন কুইজ • আপনার উত্তর স্থানীয়ভাবে সংরক্ষিত হয়', ta: 'ஆஃப்லைன் வினாடி வினா • உங்கள் பதில்கள் சாதனத்தில் சேமிக்கப்படும்', te: 'ఆఫ్‌లైన్ క్విజ్ • మీ సమాధానాలు స్థానికంగా సేవ్ అవుతాయి', gu: 'ઑફલાઇન ક્વિઝ • તમારા જવાબો સ્થાનિક રીતે સાચવાય છે',
  },
  'quiz.questionNumber': {
    en: 'Question {{current}} of {{total}}', hi: '{{total}} में से प्रश्न {{current}}', mr: '{{total}} पैकी प्रश्न {{current}}', bn: '{{total}}টির মধ্যে প্রশ্ন {{current}}', ta: '{{total}} இல் கேள்வி {{current}}', te: '{{total}}లో ప్రశ్న {{current}}', gu: '{{total}}માંથી પ્રશ્ન {{current}}',
  },
  'quiz.finish': {
    en: 'Finish Quiz', hi: 'क्विज़ समाप्त करें', mr: 'क्विझ पूर्ण करा', bn: 'কুইজ শেষ করুন', ta: 'வினாடி வினாவை முடிக்கவும்', te: 'క్విజ్ ముగించండి', gu: 'ક્વિઝ પૂર્ણ કરો',
  },
  'quiz.nextQuestion': {
    en: 'Next Question', hi: 'अगला प्रश्न', mr: 'पुढील प्रश्न', bn: 'পরের প্রশ্ন', ta: 'அடுத்த கேள்வி', te: 'తదుపరి ప్రశ్న', gu: 'આગળનો પ્રશ્ન',
  },
  'ai.thinking': {
    en: 'Thinking…', hi: 'सोच रहा हूँ…', mr: 'विचार करत आहे…', bn: 'ভাবছি…', ta: 'யோசிக்கிறேன்…', te: 'ఆలోచిస్తోంది…', gu: 'વિચારી રહ્યું છે…',
  },
  'ai.suggestionListTuple': {
    en: 'What is the difference between a list and a tuple?', hi: 'लिस्ट और टपल में क्या अंतर है?', mr: 'लिस्ट आणि ट्युपलमध्ये काय फरक आहे?', bn: 'লিস্ট ও টিউপলের মধ্যে পার্থক্য কী?', ta: 'பட்டியல் மற்றும் டியூப்பிள் இடையே என்ன வேறுபாடு?', te: 'లిస్ట్ మరియు టపుల్ మధ్య తేడా ఏమిటి?', gu: 'લિસ્ટ અને ટ્યુપલ વચ્ચે શું તફાવત છે?',
  },
  'ai.suggestionPrimaryKey': {
    en: 'What is a primary key?', hi: 'प्राइमरी की क्या होती है?', mr: 'प्रायमरी की म्हणजे काय?', bn: 'প্রাইমারি কী কী?', ta: 'முதன்மை விசை என்றால் என்ன?', te: 'ప్రైమరీ కీ అంటే ఏమిటి?', gu: 'પ્રાઇમરી કી શું છે?',
  },
  'ai.suggestionOsi': {
    en: 'Explain the OSI model.', hi: 'OSI मॉडल समझाएं।', mr: 'OSI मॉडेल समजावून सांगा.', bn: 'OSI মডেল ব্যাখ্যা করুন।', ta: 'OSI மாதிரியை விளக்கவும்.', te: 'OSI మోడల్‌ను వివరించండి.', gu: 'OSI મોડેલ સમજાવો.',
  },
  'ai.confidenceHigh': {
    en: 'High', hi: 'उच्च', mr: 'उच्च', bn: 'উচ্চ', ta: 'உயர்', te: 'అధికం', gu: 'ઊંચો',
  },
  'ai.confidenceMedium': {
    en: 'Medium', hi: 'मध्यम', mr: 'मध्यम', bn: 'মাঝারি', ta: 'நடுத்தரம்', te: 'మధ్యస్థం', gu: 'મધ્યમ',
  },
  'ai.confidenceLow': {
    en: 'Low', hi: 'कम', mr: 'कमी', bn: 'কম', ta: 'குறைவு', te: 'తక్కువ', gu: 'નીચું',
  },
  'profileEdit.title': {
    en: 'Edit Profile', hi: 'प्रोफ़ाइल संपादित करें', mr: 'प्रोफाइल संपादित करा', bn: 'প্রোফাইল সম্পাদনা করুন', ta: 'சுயவிவரத்தைத் திருத்து', te: 'ప్రొఫైల్‌ను సవరించండి', gu: 'પ્રોફાઇલ સંપાદિત કરો',
  },
  'profileEdit.onlineRequired': {
    en: 'Your profile can only be edited while online.', hi: 'आपकी प्रोफ़ाइल केवल ऑनलाइन होने पर संपादित की जा सकती है।', mr: 'तुमची प्रोफाइल फक्त ऑनलाइन असताना संपादित करता येते.', bn: 'অনলাইনে থাকলেই আপনার প্রোফাইল সম্পাদনা করা যাবে।', ta: 'ஆன்லைனில் இருக்கும்போது மட்டுமே சுயவிவரத்தைத் திருத்த முடியும்.', te: 'ఆన్‌లైన్‌లో ఉన్నప్పుడే మీ ప్రొఫైల్‌ను సవరించవచ్చు.', gu: 'તમારી પ્રોફાઇલ ફક્ત ઓનલાઇન હો ત્યારે સંપાદિત કરી શકાય છે.',
  },
  'profileEdit.education': {
    en: 'Education', hi: 'शिक्षा', mr: 'शिक्षण', bn: 'শিক্ষা', ta: 'கல்வி', te: 'విద్య', gu: 'શિક્ષણ',
  },
  'profileEdit.educationLevel': {
    en: 'Education level', hi: 'शिक्षा का स्तर', mr: 'शिक्षणाची पातळी', bn: 'শিক্ষার স্তর', ta: 'கல்வி நிலை', te: 'విద్యా స్థాయి', gu: 'શિક્ષણનું સ્તર',
  },
  'profileEdit.institution': {
    en: 'Institution', hi: 'संस्थान', mr: 'संस्था', bn: 'প্রতিষ্ঠান', ta: 'கல்வி நிறுவனம்', te: 'సంస్థ', gu: 'સંસ્થા',
  },
  'profileEdit.courseAndSemester': {
    en: 'Course and semester', hi: 'कोर्स और सेमेस्टर', mr: 'कोर्स आणि सत्र', bn: 'কোর্স ও সেমিস্টার', ta: 'கோர்ஸ் மற்றும் பருவம்', te: 'కోర్సు మరియు సెమిస్టర్', gu: 'કોર્સ અને સેમેસ્ટર',
  },
  'profileEdit.coursePlaceholder': {
    en: 'e.g. Diploma in CS', hi: 'उदा. कंप्यूटर साइंस में डिप्लोमा', mr: 'उदा. संगणकशास्त्रातील डिप्लोमा', bn: 'যেমন: কম্পিউটার সায়েন্সে ডিপ্লোমা', ta: 'எ.கா. கணினி அறிவியலில் டிப்ளமோ', te: 'ఉదా. కంప్యూటర్ సైన్స్‌లో డిప్లొమా', gu: 'દા.ત. કમ્પ્યુટર સાયન્સમાં ડિપ્લોમા',
  },
  'profileEdit.semesterPlaceholder': {
    en: 'Sem', hi: 'सेम', mr: 'सत्र', bn: 'সেম', ta: 'பருவம்', te: 'సెమ్', gu: 'સેમ',
  },
  'profileEdit.interests': {
    en: 'Interests', hi: 'रुचियां', mr: 'आवडी', bn: 'আগ্রহ', ta: 'விருப்பங்கள்', te: 'ఆసక్తులు', gu: 'રુચિઓ',
  },
  'profileEdit.interestsHint': {
    en: 'Comma-separated, e.g. coding, data, networking. Used for career guidance.', hi: 'अल्पविराम से अलग करें, जैसे coding, data, networking। करियर मार्गदर्शन के लिए उपयोग किया जाता है।', mr: 'स्वल्पविरामाने वेगळे करा, उदा. coding, data, networking. करिअर मार्गदर्शनासाठी वापरले जाते.', bn: 'কমা দিয়ে আলাদা করুন, যেমন coding, data, networking। ক্যারিয়ার নির্দেশনায় ব্যবহৃত হয়।', ta: 'காற்புள்ளியால் பிரிக்கவும், எ.கா. coding, data, networking. தொழில் வழிகாட்டலுக்குப் பயன்படும்.', te: 'కామాలతో వేరు చేయండి, ఉదా. coding, data, networking. కెరీర్ మార్గదర్శకత్వానికి ఉపయోగిస్తారు.', gu: 'અલ્પવિરામથી અલગ કરો, દા.ત. coding, data, networking. કારકિર્દી માર્ગદર્શન માટે વપરાય છે.',
  },
  'profileEdit.scholarshipMatching': {
    en: 'For scholarship matching', hi: 'छात्रवृत्ति मिलान के लिए', mr: 'शिष्यवृत्ती जुळणीसाठी', bn: 'বৃত্তি মেলানোর জন্য', ta: 'உதவித்தொகை பொருத்தத்திற்காக', te: 'స్కాలర్‌షిప్ సరిపోలిక కోసం', gu: 'શિષ્યવૃત્તિ મેળ માટે',
  },
  'profileEdit.dateOfBirth': {
    en: 'Date of birth', hi: 'जन्म तिथि', mr: 'जन्मतारीख', bn: 'জন্মতারিখ', ta: 'பிறந்த தேதி', te: 'పుట్టిన తేదీ', gu: 'જન્મ તારીખ',
  },
  'profileEdit.dateFormatHint': {
    en: 'Year-month-day, e.g. 2006-05-21', hi: 'वर्ष-माह-दिन, जैसे 2006-05-21', mr: 'वर्ष-महिना-दिवस, उदा. 2006-05-21', bn: 'বছর-মাস-দিন, যেমন 2006-05-21', ta: 'ஆண்டு-மாதம்-நாள், எ.கா. 2006-05-21', te: 'సంవత్సరం-నెల-రోజు, ఉదా. 2006-05-21', gu: 'વર્ષ-મહિનો-દિવસ, દા.ત. 2006-05-21',
  },
  'profileEdit.datePlaceholder': {
    en: 'YYYY-MM-DD', hi: 'वर्ष-माह-दिन', mr: 'वर्ष-महिना-दिवस', bn: 'বছর-মাস-দিন', ta: 'ஆண்டு-மாதம்-நாள்', te: 'సంవత్సరం-నెల-రోజు', gu: 'વર્ષ-મહિનો-દિવસ',
  },
  'profileEdit.gender': {
    en: 'Gender', hi: 'लिंग', mr: 'लिंग', bn: 'লিঙ্গ', ta: 'பாலினம்', te: 'లింగం', gu: 'લિંગ',
  },
  'profileEdit.state': {
    en: 'State', hi: 'राज्य', mr: 'राज्य', bn: 'রাজ্য', ta: 'மாநிலம்', te: 'రాష్ట్రం', gu: 'રાજ્ય',
  },
  'profileEdit.statePlaceholder': {
    en: 'e.g. Bihar', hi: 'उदा. बिहार', mr: 'उदा. बिहार', bn: 'যেমন: বিহার', ta: 'எ.கா. பீகார்', te: 'ఉదా. బీహార్', gu: 'દા.ત. બિહાર',
  },
  'profileEdit.category': {
    en: 'Category', hi: 'श्रेणी', mr: 'प्रवर्ग', bn: 'বিভাগ', ta: 'பிரிவு', te: 'వర్గం', gu: 'શ્રેણી',
  },
  'profileEdit.familyIncome': {
    en: 'Annual family income (₹)', hi: 'वार्षिक पारिवारिक आय (₹)', mr: 'वार्षिक कौटुंबिक उत्पन्न (₹)', bn: 'বার্ষিক পারিবারিক আয় (₹)', ta: 'ஆண்டு குடும்ப வருமானம் (₹)', te: 'వార్షిక కుటుంబ ఆదాయం (₹)', gu: 'વાર્ષિક કુટુંબની આવક (₹)',
  },
  'profileEdit.incomePlaceholder': {
    en: 'e.g. 180000', hi: 'उदा. 180000', mr: 'उदा. 180000', bn: 'যেমন: 180000', ta: 'எ.கா. 180000', te: 'ఉదా. 180000', gu: 'દા.ત. 180000',
  },
  'profileEdit.personWithDisability': {
    en: 'Person with disability', hi: 'दिव्यांग व्यक्ति', mr: 'दिव्यांग व्यक्ती', bn: 'প্রতিবন্ধী ব্যক্তি', ta: 'மாற்றுத்திறனாளி நபர்', te: 'వైకల్యం ఉన్న వ్యక్తి', gu: 'દિવ્યાંગ વ્યક્તિ',
  },
  'profileEdit.useDetailsForMatching': {
    en: 'Use these details to match scholarships', hi: 'छात्रवृत्तियां खोजने के लिए इन विवरणों का उपयोग करें', mr: 'शिष्यवृत्ती जुळवण्यासाठी या तपशीलांचा वापर करा', bn: 'বৃত্তি মেলাতে এই তথ্য ব্যবহার করুন', ta: 'உதவித்தொகைகளைப் பொருத்த இந்த விவரங்களைப் பயன்படுத்தவும்', te: 'స్కాలర్‌షిప్‌లను సరిపోల్చడానికి ఈ వివరాలను ఉపయోగించండి', gu: 'શિષ્યવૃત્તિ મેળવવા આ વિગતોનો ઉપયોગ કરો',
  },
  'profileEdit.sensitiveDetailsNotice': {
    en: 'Category, income and disability status are sensitive. GyanSetu uses them only for matching, and only while this is on. Deleting your account erases them.', hi: 'श्रेणी, आय और दिव्यांगता की जानकारी संवेदनशील है। GyanSetu इनका उपयोग केवल मिलान के लिए और इस विकल्प के चालू रहने तक करता है। अकाउंट हटाने पर ये मिटा दिए जाएंगे।', mr: 'प्रवर्ग, उत्पन्न आणि दिव्यांगत्वाची माहिती संवेदनशील आहे. GyanSetu ती फक्त जुळणीसाठी आणि हा पर्याय सुरू असेपर्यंत वापरते. खाते हटवल्यावर ती पुसली जाते.', bn: 'বিভাগ, আয় ও প্রতিবন্ধিতার তথ্য সংবেদনশীল। GyanSetu এগুলি শুধু মিলের জন্য এবং এই বিকল্প চালু থাকলেই ব্যবহার করে। অ্যাকাউন্ট মুছলে তথ্যও মুছে যাবে।', ta: 'பிரிவு, வருமானம் மற்றும் மாற்றுத்திறன் நிலை உணர்வுப்பூர்வமானவை. GyanSetu இவற்றை பொருத்தத்திற்காகவும் இந்த விருப்பம் இயக்கப்பட்டிருக்கும்போதும் மட்டுமே பயன்படுத்தும். கணக்கை நீக்கினால் இவை அழிக்கப்படும்.', te: 'వర్గం, ఆదాయం మరియు వైకల్య స్థితి సున్నితమైనవి. GyanSetu వీటిని సరిపోలిక కోసం, ఈ ఎంపిక ఆన్‌లో ఉన్నప్పుడు మాత్రమే ఉపయోగిస్తుంది. ఖాతాను తొలగిస్తే ఇవి చెరిపివేయబడతాయి.', gu: 'શ્રેણી, આવક અને દિવ્યાંગતાની સ્થિતિ સંવેદનશીલ છે. GyanSetu તેનો ઉપયોગ માત્ર મેળ માટે અને આ વિકલ્પ ચાલુ હોય ત્યારે જ કરે છે. ખાતું કાઢવાથી તે ભૂંસાઈ જશે.',
  },
  'profileEdit.female': {
    en: 'Female', hi: 'महिला', mr: 'स्त्री', bn: 'নারী', ta: 'பெண்', te: 'మహిళ', gu: 'સ્ત્રી',
  },
  'profileEdit.male': {
    en: 'Male', hi: 'पुरुष', mr: 'पुरुष', bn: 'পুরুষ', ta: 'ஆண்', te: 'పురుషుడు', gu: 'પુરુષ',
  },
  'profileEdit.other': {
    en: 'Other', hi: 'अन्य', mr: 'इतर', bn: 'অন্যান্য', ta: 'மற்றவை', te: 'ఇతర', gu: 'અન્ય',
  },
  'profileEdit.preferNotToSay': {
    en: 'Prefer not to say', hi: 'बताना नहीं चाहते', mr: 'सांगू इच्छित नाही', bn: 'বলতে চাই না', ta: 'தெரிவிக்க விரும்பவில்லை', te: 'చెప్పదలచుకోలేదు', gu: 'જણાવવા માંગતા નથી',
  },
  'profileEdit.school': {
    en: 'School', hi: 'स्कूल', mr: 'शाळा', bn: 'স্কুল', ta: 'பள்ளி', te: 'పాఠశాల', gu: 'શાળા',
  },
  'profileEdit.diploma': {
    en: 'Diploma', hi: 'डिप्लोमा', mr: 'डिप्लोमा', bn: 'ডিপ্লোমা', ta: 'டிப்ளமோ', te: 'డిప్లొమా', gu: 'ડિપ્લોમા',
  },
  'profileEdit.undergraduate': {
    en: 'Undergraduate', hi: 'स्नातक', mr: 'पदवीपूर्व', bn: 'স্নাতক', ta: 'இளங்கலை', te: 'అండర్‌గ్రాడ్యుయేట్', gu: 'અંડરગ્રેજ્યુએટ',
  },
  'profileEdit.postgraduate': {
    en: 'Postgraduate', hi: 'स्नातकोत्तर', mr: 'पदव्युत्तर', bn: 'স্নাতকোত্তর', ta: 'முதுகலை', te: 'పోస్ట్‌గ్రాడ్యుయేట్', gu: 'પોસ્ટગ્રેજ્યુએટ',
  },
  'profileEdit.yes': {
    en: 'Yes', hi: 'हां', mr: 'होय', bn: 'হ্যাঁ', ta: 'ஆம்', te: 'అవును', gu: 'હા',
  },
  'profileEdit.no': {
    en: 'No', hi: 'नहीं', mr: 'नाही', bn: 'না', ta: 'இல்லை', te: 'కాదు', gu: 'ના',
  },
  'profileEdit.invalidDateOfBirth': {
    en: 'Date of birth must look like 2006-05-21 (year-month-day).', hi: 'जन्म तिथि 2006-05-21 (वर्ष-माह-दिन) जैसी होनी चाहिए।', mr: 'जन्मतारीख 2006-05-21 (वर्ष-महिना-दिवस) अशा स्वरूपात असावी.', bn: 'জন্মতারিখ 2006-05-21 (বছর-মাস-দিন) এর মতো হতে হবে।', ta: 'பிறந்த தேதி 2006-05-21 (ஆண்டு-மாதம்-நாள்) வடிவில் இருக்க வேண்டும்.', te: 'పుట్టిన తేదీ 2006-05-21 (సంవత్సరం-నెల-రోజు) రూపంలో ఉండాలి.', gu: 'જન્મ તારીખ 2006-05-21 (વર્ષ-મહિનો-દિવસ) જેવી હોવી જોઈએ.',
  },
  'profileEdit.invalidIncome': {
    en: 'Family income must be a whole number of rupees per year.', hi: 'पारिवारिक आय रुपये में वार्षिक पूर्ण संख्या होनी चाहिए।', mr: 'कौटुंबिक उत्पन्न वार्षिक रुपयांमध्ये पूर्णांक असावे.', bn: 'পারিবারিক আয় বার্ষিক পূর্ণ সংখ্যক টাকা হতে হবে।', ta: 'குடும்ப வருமானம் ஆண்டுக்கு முழு ரூபாய் எண்ணாக இருக்க வேண்டும்.', te: 'కుటుంబ ఆదాయం సంవత్సరానికి పూర్తి రూపాయల సంఖ్యగా ఉండాలి.', gu: 'કુટુંબની આવક વાર્ષિક પૂર્ણ રૂપિયા સંખ્યા હોવી જોઈએ.',
  },
  'profileEdit.invalidSemester': {
    en: 'Semester must be between 1 and 12.', hi: 'सेमेस्टर 1 से 12 के बीच होना चाहिए।', mr: 'सत्र 1 ते 12 दरम्यान असावे.', bn: 'সেমিস্টার ১ থেকে ১২-এর মধ্যে হতে হবে।', ta: 'பருவம் 1 முதல் 12 வரை இருக்க வேண்டும்.', te: 'సెమిస్టర్ 1 నుండి 12 మధ్య ఉండాలి.', gu: 'સેમેસ્ટર 1 અને 12 વચ્ચે હોવો જોઈએ.',
  },
  'scholarship.find': {
    en: 'Find Scholarships', hi: 'छात्रवृत्तियां खोजें', mr: 'शिष्यवृत्ती शोधा', bn: 'বৃত্তি খুঁজুন', ta: 'உதவித்தொகைகளைக் கண்டறியவும்', te: 'స్కాలర్‌షిప్‌లను కనుగొనండి', gu: 'શિષ્યવૃત્તિ શોધો',
  },
  'scholarship.subtitle': {
    en: 'Scholarships you appear to match, based on your profile.', hi: 'आपकी प्रोफ़ाइल के आधार पर आपके लिए उपयुक्त छात्रवृत्तियां।', mr: 'तुमच्या प्रोफाइलनुसार जुळणाऱ्या शिष्यवृत्ती.', bn: 'আপনার প্রোফাইল অনুযায়ী আপনার সঙ্গে মেলে এমন বৃত্তি।', ta: 'உங்கள் சுயவிவரத்தின் அடிப்படையில் பொருந்தக்கூடிய உதவித்தொகைகள்.', te: 'మీ ప్రొఫైల్ ఆధారంగా మీకు సరిపోయే స్కాలర్‌షిప్‌లు.', gu: 'તમારી પ્રોફાઇલ મુજબ તમને અનુકૂળ શિષ્યવૃત્તિ.',
  },
  'scholarship.loginPrompt': {
    en: 'Log in to see scholarships matched to your profile.', hi: 'अपनी प्रोफ़ाइल से मेल खाने वाली छात्रवृत्तियां देखने के लिए लॉगिन करें।', mr: 'तुमच्या प्रोफाइलला जुळणाऱ्या शिष्यवृत्ती पाहण्यासाठी लॉगिन करा.', bn: 'আপনার প্রোফাইলের সঙ্গে মেলা বৃত্তি দেখতে লগ ইন করুন।', ta: 'உங்கள் சுயவிவரத்திற்குப் பொருந்தும் உதவித்தொகைகளைப் பார்க்க உள்நுழையவும்.', te: 'మీ ప్రొఫైల్‌కు సరిపోయే స్కాలర్‌షిప్‌లను చూడటానికి లాగిన్ చేయండి.', gu: 'તમારી પ્રોફાઇલને અનુકૂળ શિષ્યવૃત્તિ જોવા લૉગિન કરો.',
  },
  'scholarship.completeProfilePrompt': {
    en: 'Add your details and allow matching to see which scholarships you qualify for.', hi: 'आप किन छात्रवृत्तियों के पात्र हैं, यह देखने के लिए विवरण जोड़ें और मिलान की अनुमति दें।', mr: 'कोणत्या शिष्यवृत्तीसाठी पात्र आहात हे पाहण्यासाठी तपशील जोडा आणि जुळणीला परवानगी द्या.', bn: 'কোন বৃত্তির জন্য যোগ্য তা দেখতে তথ্য যোগ করুন ও ম্যাচিং অনুমতি দিন।', ta: 'எந்த உதவித்தொகைகளுக்குத் தகுதியானவர் என்பதைப் பார்க்க விவரங்களைச் சேர்த்து பொருத்த அனுமதிக்கவும்.', te: 'మీకు ఏ స్కాలర్‌షిప్‌లు అర్హమో చూడటానికి వివరాలు జోడించి సరిపోలికను అనుమతించండి.', gu: 'કઈ શિષ્યવૃત્તિ માટે પાત્ર છો તે જોવા વિગતો ઉમેરો અને મેળની મંજૂરી આપો.',
  },
  'scholarship.completeProfile': {
    en: 'Complete profile', hi: 'प्रोफ़ाइल पूरी करें', mr: 'प्रोफाइल पूर्ण करा', bn: 'প্রোফাইল সম্পূর্ণ করুন', ta: 'சுயவிவரத்தை நிறைவு செய்க', te: 'ప్రొఫైల్ పూర్తి చేయండి', gu: 'પ્રોફાઇલ પૂર્ણ કરો',
  },
  'scholarship.offlineResults': {
    en: 'You’re offline. Showing scholarships as of {{time}}.', hi: 'आप ऑफ़लाइन हैं। {{time}} तक की छात्रवृत्तियां दिखाई जा रही हैं।', mr: 'तुम्ही ऑफलाइन आहात. {{time}} पर्यंतच्या शिष्यवृत्ती दाखवत आहोत.', bn: 'আপনি অফলাইনে আছেন। {{time}} অনুযায়ী বৃত্তি দেখানো হচ্ছে।', ta: 'நீங்கள் ஆஃப்லைனில் உள்ளீர்கள். {{time}} நிலவர உதவித்தொகைகள் காட்டப்படுகின்றன.', te: 'మీరు ఆఫ్‌లైన్‌లో ఉన్నారు. {{time}} నాటి స్కాలర్‌షిప్‌లు చూపబడుతున్నాయి.', gu: 'તમે ઑફલાઇન છો. {{time}} મુજબની શિષ્યવૃત્તિ બતાવીએ છીએ.',
  },
  'scholarship.searchPlaceholder': {
    en: 'Search scholarships...', hi: 'छात्रवृत्तियां खोजें...', mr: 'शिष्यवृत्ती शोधा...', bn: 'বৃত্তি খুঁজুন...', ta: 'உதவித்தொகைகளைத் தேடுங்கள்...', te: 'స్కాలర్‌షిప్‌లను వెతకండి...', gu: 'શિષ્યવૃત્તિ શોધો...',
  },
  'scholarship.all': {
    en: 'All', hi: 'सभी', mr: 'सर्व', bn: 'সব', ta: 'அனைத்தும்', te: 'అన్నీ', gu: 'બધા',
  },
  'scholarship.likelyMatch': {
    en: 'Likely match', hi: 'संभावित मेल', mr: 'संभाव्य जुळणी', bn: 'সম্ভাব্য মিল', ta: 'பொருந்த வாய்ப்பு', te: 'సరిపోయే అవకాశం', gu: 'સંભવિત મેળ',
  },
  'scholarship.checkDetails': {
    en: 'Check details', hi: 'विवरण जांचें', mr: 'तपशील तपासा', bn: 'বিস্তারিত দেখুন', ta: 'விவரங்களைச் சரிபார்க்கவும்', te: 'వివరాలను తనిఖీ చేయండి', gu: 'વિગતો તપાસો',
  },
  'scholarship.notMatch': {
    en: 'Not a match', hi: 'मेल नहीं खाता', mr: 'जुळत नाही', bn: 'মেলে না', ta: 'பொருந்தவில்லை', te: 'సరిపోలలేదు', gu: 'મેળ નથી',
  },
  'scholarship.forYou': {
    en: 'Scholarships for you', hi: 'आपके लिए छात्रवृत्तियां', mr: 'तुमच्यासाठी शिष्यवृत्ती', bn: 'আপনার জন্য বৃত্তি', ta: 'உங்களுக்கான உதவித்தொகைகள்', te: 'మీ కోసం స్కాలర్‌షిప్‌లు', gu: 'તમારા માટે શિષ્યવૃત્તિ',
  },
  'scholarship.notFound': {
    en: 'No scholarships found', hi: 'कोई छात्रवृत्ति नहीं मिली', mr: 'शिष्यवृत्ती आढळली नाही', bn: 'কোনো বৃত্তি পাওয়া যায়নি', ta: 'உதவித்தொகைகள் எதுவும் இல்லை', te: 'స్కాలర్‌షిప్‌లు కనుగొనబడలేదు', gu: 'કોઈ શિષ્યવૃત્તિ મળી નથી',
  },
  'scholarship.tryDifferent': {
    en: 'Try a different search or tab.', hi: 'दूसरी खोज या टैब आज़माएं।', mr: 'दुसरा शोध किंवा टॅब वापरून पाहा.', bn: 'অন্য অনুসন্ধান বা ট্যাব চেষ্টা করুন।', ta: 'வேறு தேடல் அல்லது தாவலை முயற்சிக்கவும்.', te: 'వేరే శోధన లేదా ట్యాబ్ ప్రయత్నించండి.', gu: 'બીજી શોધ અથવા ટૅબ અજમાવો.',
  },
  'scholarship.information': {
    en: 'Scholarship information', hi: 'छात्रवृत्ति की जानकारी', mr: 'शिष्यवृत्तीची माहिती', bn: 'বৃত্তির তথ্য', ta: 'உதவித்தொகை தகவல்', te: 'స్కాలర్‌షిప్ సమాచారం', gu: 'શિષ્યવૃત્તિ માહિતી',
  },
  'scholarship.deadline': {
    en: 'Deadline', hi: 'अंतिम तिथि', mr: 'अंतिम तारीख', bn: 'শেষ তারিখ', ta: 'கடைசி தேதி', te: 'గడువు తేదీ', gu: 'છેલ્લી તારીખ',
  },
  'scholarship.open': {
    en: 'Open', hi: 'खुली', mr: 'खुली', bn: 'খোলা', ta: 'திறந்துள்ளது', te: 'తెరిచి ఉంది', gu: 'ખુલ્લી',
  },
  'scholarship.apply': {
    en: 'Apply', hi: 'आवेदन करें', mr: 'अर्ज करा', bn: 'আবেদন করুন', ta: 'விண்ணப்பிக்கவும்', te: 'దరఖాస్తు చేయండి', gu: 'અરજી કરો',
  },
  'scholarship.verified': {
    en: 'Details last verified {{date}}', hi: 'विवरण की अंतिम जांच {{date}} को हुई', mr: 'तपशीलांची शेवटची पडताळणी {{date}} रोजी झाली', bn: 'তথ্য সর্বশেষ যাচাই হয়েছে {{date}}', ta: 'விவரங்கள் கடைசியாக சரிபார்க்கப்பட்ட தேதி {{date}}', te: 'వివరాలు చివరిగా ధృవీకరించబడిన తేదీ {{date}}', gu: 'વિગતો છેલ્લે {{date}}ના રોજ ચકાસાઈ',
  },
  'scholarship.defaultDisclaimer': {
    en: 'Eligibility and deadlines may change. Always verify the details on the official scholarship website before applying.', hi: 'पात्रता और अंतिम तिथियां बदल सकती हैं। आवेदन से पहले आधिकारिक छात्रवृत्ति वेबसाइट पर विवरण जांचें।', mr: 'पात्रता आणि अंतिम तारखा बदलू शकतात. अर्ज करण्यापूर्वी अधिकृत वेबसाइटवर तपशील तपासा.', bn: 'যোগ্যতা ও সময়সীমা পরিবর্তিত হতে পারে। আবেদন করার আগে অফিসিয়াল ওয়েবসাইটে তথ্য যাচাই করুন।', ta: 'தகுதி மற்றும் காலக்கெடு மாறலாம். விண்ணப்பிக்கும் முன் அதிகாரப்பூர்வ இணையதளத்தில் விவரங்களைச் சரிபார்க்கவும்.', te: 'అర్హత మరియు గడువులు మారవచ్చు. దరఖాస్తు చేయడానికి ముందు అధికారిక వెబ్‌సైట్‌లో వివరాలను తనిఖీ చేయండి.', gu: 'પાત્રતા અને છેલ્લી તારીખ બદલાઈ શકે છે. અરજી કરતા પહેલાં અધિકૃત વેબસાઇટ પર વિગતો તપાસો.',
  },
  'courseDetails.title': {
    en: 'Course Details', hi: 'कोर्स का विवरण', mr: 'कोर्सचा तपशील', bn: 'কোর্সের বিবরণ', ta: 'கோர்ஸ் விவரங்கள்', te: 'కోర్సు వివరాలు', gu: 'કોર્સની વિગતો',
  },
  'courseDetails.unavailable': {
    en: 'Course not available offline', hi: 'कोर्स ऑफ़लाइन उपलब्ध नहीं है', mr: 'कोर्स ऑफलाइन उपलब्ध नाही', bn: 'কোর্স অফলাইনে উপলব্ধ নয়', ta: 'கோர்ஸ் ஆஃப்லைனில் கிடைக்கவில்லை', te: 'కోర్సు ఆఫ్‌లైన్‌లో అందుబాటులో లేదు', gu: 'કોર્સ ઑફલાઇન ઉપલબ્ધ નથી',
  },
  'courseDetails.connectToLoad': {
    en: 'Connect to the internet and open Courses to load it.', hi: 'इसे लोड करने के लिए इंटरनेट से जुड़ें और कोर्स खोलें।', mr: 'लोड करण्यासाठी इंटरनेटशी जोडा आणि कोर्स उघडा.', bn: 'লোড করতে ইন্টারনেটে সংযোগ করে কোর্স খুলুন।', ta: 'ஏற்றுவதற்கு இணையத்துடன் இணைந்து கோர்ஸ்களைத் திறக்கவும்.', te: 'లోడ్ చేయడానికి ఇంటర్నెట్‌కు కనెక్ట్ చేసి కోర్సులను తెరవండి.', gu: 'લોડ કરવા ઇન્ટરનેટથી જોડાઈને કોર્સ ખોલો.',
  },
  'courseDetails.pack': {
    en: 'Learning Pack', hi: 'लर्निंग पैक', mr: 'लर्निंग पॅक', bn: 'লার্নিং প্যাক', ta: 'கற்றல் தொகுப்பு', te: 'లెర్నింగ్ ప్యాక్', gu: 'લર્નિંગ પૅક',
  },
  'courseDetails.removeDownload': {
    en: 'Remove download?', hi: 'डाउनलोड हटाएं?', mr: 'डाउनलोड काढायचे?', bn: 'ডাউনলোড সরাবেন?', ta: 'பதிவிறக்கத்தை நீக்கவா?', te: 'డౌన్‌లోడ్‌ను తీసివేయాలా?', gu: 'ડાઉનલોડ દૂર કરવું છે?',
  },
  'courseDetails.removeWarning': {
    en: 'The downloaded lessons and videos will be deleted from this phone. Your progress is kept.', hi: 'डाउनलोड किए गए पाठ और वीडियो इस फोन से हट जाएंगे। आपकी प्रगति सुरक्षित रहेगी।', mr: 'डाउनलोड केलेले धडे आणि व्हिडिओ या फोनवरून हटवले जातील. प्रगती जतन राहील.', bn: 'ডাউনলোড করা পাঠ ও ভিডিও এই ফোন থেকে মুছে যাবে। আপনার অগ্রগতি থাকবে।', ta: 'பதிவிறக்கம் செய்த பாடங்களும் வீடியோக்களும் இந்த போனிலிருந்து நீக்கப்படும். முன்னேற்றம் பாதுகாக்கப்படும்.', te: 'డౌన్‌లోడ్ చేసిన పాఠాలు, వీడియోలు ఈ ఫోన్ నుండి తొలగుతాయి. మీ ప్రగతి అలాగే ఉంటుంది.', gu: 'ડાઉનલોડ કરેલા પાઠ અને વિડિયો આ ફોનમાંથી કાઢી નાખવામાં આવશે. પ્રગતિ જળવાશે.',
  },
  'courseDetails.remove': {
    en: 'Remove', hi: 'हटाएं', mr: 'काढा', bn: 'সরান', ta: 'நீக்கு', te: 'తీసివేయి', gu: 'દૂર કરો',
  },
  'courseDetails.downloadLogin': {
    en: 'Log in to download', hi: 'डाउनलोड करने के लिए लॉगिन करें', mr: 'डाउनलोडसाठी लॉगिन करा', bn: 'ডাউনলোড করতে লগ ইন করুন', ta: 'பதிவிறக்க உள்நுழையவும்', te: 'డౌన్‌లోడ్ చేయడానికి లాగిన్ చేయండి', gu: 'ડાઉનલોડ કરવા લૉગિન કરો',
  },
  'courseDetails.downloadButton': {
    en: 'Download', hi: 'डाउनलोड करें', mr: 'डाउनलोड करा', bn: 'ডাউনলোড', ta: 'பதிவிறக்கவும்', te: 'డౌన్‌లోడ్ చేయండి', gu: 'ડાઉનલોડ કરો',
  },
  'courseDetails.liteButton': {
    en: 'Lite', hi: 'लाइट', mr: 'लाइट', bn: 'লাইট', ta: 'லைட்', te: 'లైట్', gu: 'લાઇટ',
  },
  'courseDetails.courseCompleted': {
    en: 'Course completed! 🎉', hi: 'कोर्स पूरा हुआ! 🎉', mr: 'कोर्स पूर्ण झाला! 🎉', bn: 'কোর্স সম্পন্ন! 🎉', ta: 'கோர்ஸ் முடிந்தது! 🎉', te: 'కోర్సు పూర్తయింది! 🎉', gu: 'કોર્સ પૂર્ણ થયો! 🎉',
  },
  'courseDetails.startFirstLesson': {
    en: 'Start your first lesson to begin.', hi: 'शुरू करने के लिए पहला पाठ खोलें।', mr: 'सुरुवात करण्यासाठी पहिला धडा सुरू करा.', bn: 'শুরু করতে প্রথম পাঠটি শুরু করুন।', ta: 'தொடங்க உங்கள் முதல் பாடத்தைத் தொடங்கவும்.', te: 'ప్రారంభించడానికి మొదటి పాఠాన్ని మొదలుపెట్టండి.', gu: 'શરૂ કરવા પહેલો પાઠ શરૂ કરો.',
  },
  'courseDetails.keepGoing': {
    en: 'Keep going — your progress is saved offline.', hi: 'जारी रखें — आपकी प्रगति ऑफ़लाइन सहेजी जाती है।', mr: 'पुढे चालू ठेवा — प्रगती ऑफलाइन जतन होते.', bn: 'চালিয়ে যান — আপনার অগ্রগতি অফলাইনে সংরক্ষিত হয়।', ta: 'தொடருங்கள் — உங்கள் முன்னேற்றம் ஆஃப்லைனில் சேமிக்கப்படுகிறது.', te: 'కొనసాగించండి — మీ ప్రగతి ఆఫ్‌లైన్‌లో సేవ్ అవుతుంది.', gu: 'ચાલુ રાખો — તમારી પ્રગતિ ઑફલાઇન સાચવાય છે.',
  },
  'courseDetails.continueWhereLeftOff': {
    en: 'Continue where you left off', hi: 'जहां छोड़ा था वहीं से जारी रखें', mr: 'जिथे थांबला होता तिथून पुढे सुरू ठेवा', bn: 'যেখানে ছেড়েছিলেন সেখান থেকে চালিয়ে যান', ta: 'நிறுத்திய இடத்திலிருந்து தொடரவும்', te: 'మీరు ఆపిన చోటు నుండి కొనసాగించండి', gu: 'જ્યાંથી છોડ્યું હતું ત્યાંથી ચાલુ રાખો',
  },
  'courseDetails.tapLessonToStart': {
    en: 'Tap a lesson to start', hi: 'शुरू करने के लिए पाठ चुनें', mr: 'सुरू करण्यासाठी धड्यावर टॅप करा', bn: 'শুরু করতে একটি পাঠে ট্যাপ করুন', ta: 'தொடங்க ஒரு பாடத்தைத் தட்டவும்', te: 'ప్రారంభించడానికి పాఠాన్ని నొక్కండి', gu: 'શરૂ કરવા પાઠ પર ટૅપ કરો',
  },
  'courseDetails.noLessons': {
    en: 'No lessons on this phone yet. Download the course to study it offline.', hi: 'इस फोन पर अभी कोई पाठ नहीं है। ऑफ़लाइन पढ़ने के लिए कोर्स डाउनलोड करें।', mr: 'या फोनवर अजून धडे नाहीत. ऑफलाइन अभ्यासासाठी कोर्स डाउनलोड करा.', bn: 'এই ফোনে এখনও কোনো পাঠ নেই। অফলাইনে পড়তে কোর্স ডাউনলোড করুন।', ta: 'இந்த போனில் இன்னும் பாடங்கள் இல்லை. ஆஃப்லைனில் படிக்க கோர்ஸைப் பதிவிறக்கவும்.', te: 'ఈ ఫోన్‌లో ఇంకా పాఠాలు లేవు. ఆఫ్‌లైన్‌లో చదవడానికి కోర్సును డౌన్‌లోడ్ చేయండి.', gu: 'આ ફોનમાં હજી પાઠ નથી. ઑફલાઇન અભ્યાસ કરવા કોર્સ ડાઉનલોડ કરો.',
  },
  'courseDetails.quizPhoneOffline': {
    en: 'Scored on your phone, works offline', hi: 'फोन पर स्कोर देखें, ऑफ़लाइन भी काम करता है', mr: 'फोनवर गुण मिळवा, ऑफलाइनही चालते', bn: 'ফোনে স্কোর হবে, অফলাইনেও চলবে', ta: 'போனில் மதிப்பெண் கணக்கிடப்படும்; ஆஃப்லைனிலும் இயங்கும்', te: 'ఫోన్‌లో స్కోర్ అవుతుంది, ఆఫ్‌లైన్‌లోనూ పనిచేస్తుంది', gu: 'ફોનમાં સ્કોર થાય, ઑફલાઇન પણ ચાલે',
  },
  'courseDetails.learningContinuesOffline': {
    en: 'Learning continues offline', hi: 'ऑफ़लाइन सीखना जारी रहता है', mr: 'ऑफलाइन शिक्षण सुरूच राहते', bn: 'অফলাইনে শেখা চলতে থাকে', ta: 'ஆஃப்லைனிலும் கற்றல் தொடர்கிறது', te: 'ఆఫ్‌లైన్‌లోనూ అభ్యాసం కొనసాగుతుంది', gu: 'ઑફલાઇન પણ અભ્યાસ ચાલુ રહે છે',
  },
  'courseDetails.progressSavedOffline': {
    en: 'Your lesson progress is saved on your device. You can continue studying without an internet connection.', hi: 'आपके पाठों की प्रगति इस डिवाइस पर सहेजी जाती है। आप इंटरनेट के बिना पढ़ाई जारी रख सकते हैं।', mr: 'धड्यांची प्रगती या डिव्हाइसवर जतन होते. इंटरनेटशिवाय अभ्यास सुरू ठेवता येतो.', bn: 'আপনার পাঠের অগ্রগতি এই ডিভাইসে সংরক্ষিত হয়। ইন্টারনেট ছাড়াই পড়া চালিয়ে যেতে পারবেন।', ta: 'பாட முன்னேற்றம் இந்த சாதனத்தில் சேமிக்கப்படும். இணையம் இல்லாமலும் படிப்பைத் தொடரலாம்.', te: 'మీ పాఠాల ప్రగతి ఈ పరికరంలో సేవ్ అవుతుంది. ఇంటర్నెట్ లేకుండానే చదువు కొనసాగించవచ్చు.', gu: 'તમારા પાઠની પ્રગતિ આ ઉપકરણમાં સાચવાય છે. ઇન્ટરનેટ વિના અભ્યાસ ચાલુ રાખી શકો છો.',
  },
  'courseDetails.versionAvailable': {
    en: 'Version {{version}} is available. Your progress carries over.', hi: 'संस्करण {{version}} उपलब्ध है। आपकी प्रगति बनी रहेगी।', mr: 'आवृत्ती {{version}} उपलब्ध आहे. तुमची प्रगती कायम राहील.', bn: 'সংস্করণ {{version}} উপলব্ধ। আপনার অগ্রগতি বহাল থাকবে।', ta: 'பதிப்பு {{version}} கிடைக்கிறது. உங்கள் முன்னேற்றம் தொடரும்.', te: 'వెర్షన్ {{version}} అందుబాటులో ఉంది. మీ ప్రగతి అలాగే ఉంటుంది.', gu: 'આવૃત્તિ {{version}} ઉપલબ્ધ છે. તમારી પ્રગતિ જળવાશે.',
  },
  'courseDetails.downloadedOnPhone': {
    en: 'Downloaded • {{size}} on this phone.', hi: 'डाउनलोड किया गया • इस फोन पर {{size}}।', mr: 'डाउनलोड केले • या फोनवर {{size}}.', bn: 'ডাউনলোড করা • এই ফোনে {{size}}।', ta: 'பதிவிறக்கம் செய்யப்பட்டது • இந்த போனில் {{size}}.', te: 'డౌన్‌లోడ్ అయింది • ఈ ఫోన్‌లో {{size}}.', gu: 'ડાઉનલોડ થયું • આ ફોનમાં {{size}}.',
  },
  'courseDetails.loginToDownloadDescription': {
    en: 'Log in to download the full course for offline learning. Starter samples work without an account.', hi: 'ऑफ़लाइन सीखने के लिए पूरा कोर्स डाउनलोड करने हेतु लॉगिन करें। स्टार्टर नमूने बिना अकाउंट के काम करते हैं।', mr: 'ऑफलाइन शिकण्यासाठी पूर्ण कोर्स डाउनलोड करण्यासाठी लॉगिन करा. स्टार्टर नमुने खात्याशिवाय चालतात.', bn: 'অফলাইনে শিখতে সম্পূর্ণ কোর্স ডাউনলোড করতে লগ ইন করুন। স্টার্টার নমুনা অ্যাকাউন্ট ছাড়াই চলে।', ta: 'ஆஃப்லைனில் கற்க முழு கோர்ஸைப் பதிவிறக்க உள்நுழையவும். ஸ்டார்டர் மாதிரிகள் கணக்கு இல்லாமலும் இயங்கும்.', te: 'ఆఫ్‌లైన్‌లో నేర్చుకోవడానికి పూర్తి కోర్సును డౌన్‌లోడ్ చేయడానికి లాగిన్ చేయండి. స్టార్టర్ నమూనాలు ఖాతా లేకుండా పనిచేస్తాయి.', gu: 'ઑફલાઇન શીખવા આખો કોર્સ ડાઉનલોડ કરવા લૉગિન કરો. સ્ટાર્ટર નમૂનાઓ ખાતા વિના ચાલે છે.',
  },
  'courseDetails.downloadOnce': {
    en: 'Download once, then learn without internet. Lite skips videos to save data and space.', hi: 'एक बार डाउनलोड करें और फिर इंटरनेट के बिना सीखें। लाइट डेटा और जगह बचाने के लिए वीडियो छोड़ता है।', mr: 'एकदा डाउनलोड करा आणि इंटरनेटशिवाय शिका. लाइटमध्ये डेटा व जागा वाचवण्यासाठी व्हिडिओ नसतात.', bn: 'একবার ডাউনলোড করে ইন্টারনেট ছাড়াই শিখুন। ডেটা ও জায়গা বাঁচাতে লাইটে ভিডিও নেই।', ta: 'ஒருமுறை பதிவிறக்கி இணையமின்றி கற்கவும். தரவு மற்றும் இடத்தைச் சேமிக்க லைட் பதிப்பில் வீடியோக்கள் இல்லை.', te: 'ఒక్కసారి డౌన్‌లోడ్ చేసి ఇంటర్నెట్ లేకుండా నేర్చుకోండి. డేటా, స్థలం ఆదా చేయడానికి లైట్‌లో వీడియోలు ఉండవు.', gu: 'એકવાર ડાઉનલોડ કરીને ઇન્ટરનેટ વિના શીખો. ડેટા અને જગ્યા બચાવવા લાઇટમાં વિડિયો નથી.',
  },
  'courseDetails.connectToDownload': {
    en: 'Connect to the internet to download this course.', hi: 'इस कोर्स को डाउनलोड करने के लिए इंटरनेट से जुड़ें।', mr: 'हा कोर्स डाउनलोड करण्यासाठी इंटरनेटशी जोडा.', bn: 'এই কোর্স ডাউনলোড করতে ইন্টারনেটে সংযোগ করুন।', ta: 'இந்த கோர்ஸைப் பதிவிறக்க இணையத்துடன் இணைக்கவும்.', te: 'ఈ కోర్సును డౌన్‌లోడ్ చేయడానికి ఇంటర్నెట్‌కు కనెక్ట్ చేయండి.', gu: 'આ કોર્સ ડાઉનલોડ કરવા ઇન્ટરનેટ સાથે જોડાઓ.',
  },
  'lesson.notOnPhone': {
    en: 'This lesson isn’t on your phone', hi: 'यह पाठ आपके फोन पर नहीं है', mr: 'हा धडा तुमच्या फोनवर नाही', bn: 'এই পাঠটি আপনার ফোনে নেই', ta: 'இந்த பாடம் உங்கள் போனில் இல்லை', te: 'ఈ పాఠం మీ ఫోన్‌లో లేదు', gu: 'આ પાઠ તમારા ફોનમાં નથી',
  },
  'lesson.downloadToReadOffline': {
    en: 'Download the course to read it offline.', hi: 'इसे ऑफ़लाइन पढ़ने के लिए कोर्स डाउनलोड करें।', mr: 'ऑफलाइन वाचण्यासाठी कोर्स डाउनलोड करा.', bn: 'অফলাইনে পড়তে কোর্সটি ডাউনলোড করুন।', ta: 'ஆஃப்லைனில் படிக்க கோர்ஸைப் பதிவிறக்கவும்.', te: 'ఆఫ్‌లైన్‌లో చదవడానికి కోర్సును డౌన్‌లోడ్ చేయండి.', gu: 'ઑફલાઇન વાંચવા કોર્સ ડાઉનલોડ કરો.',
  },
  'lesson.numberOfTotal': {
    en: 'Lesson {{current}} of {{total}}', hi: '{{total}} में से पाठ {{current}}', mr: '{{total}} पैकी धडा {{current}}', bn: '{{total}}টির মধ্যে পাঠ {{current}}', ta: '{{total}} இல் பாடம் {{current}}', te: '{{total}}లో పాఠం {{current}}', gu: '{{total}}માંથી પાઠ {{current}}',
  },
  'lesson.number': {
    en: 'LESSON {{number}}', hi: 'पाठ {{number}}', mr: 'धडा {{number}}', bn: 'পাঠ {{number}}', ta: 'பாடம் {{number}}', te: 'పాఠం {{number}}', gu: 'પાઠ {{number}}',
  },
  'lesson.aboutMinutes': {
    en: 'About {{minutes}} min read', hi: 'लगभग {{minutes}} मिनट का पाठ', mr: 'वाचायला सुमारे {{minutes}} मिनिटे', bn: 'পড়তে প্রায় {{minutes}} মিনিট', ta: 'சுமார் {{minutes}} நிமிட வாசிப்பு', te: 'చదవడానికి సుమారు {{minutes}} నిమిషాలు', gu: 'વાંચવામાં આશરે {{minutes}} મિનિટ',
  },
  'lesson.mediaOmitted': {
    en: 'Saved on your phone. The video is skipped in the Lite pack; download the full pack to watch it.', hi: 'फोन पर सहेजा गया। लाइट पैक में वीडियो नहीं है; देखने के लिए पूरा पैक डाउनलोड करें।', mr: 'फोनवर जतन केले. लाइट पॅकमध्ये व्हिडिओ नाही; पाहण्यासाठी पूर्ण पॅक डाउनलोड करा.', bn: 'ফোনে সংরক্ষিত। লাইট প্যাকে ভিডিও নেই; দেখতে সম্পূর্ণ প্যাক ডাউনলোড করুন।', ta: 'போனில் சேமிக்கப்பட்டது. லைட் தொகுப்பில் வீடியோ இல்லை; பார்க்க முழு தொகுப்பைப் பதிவிறக்கவும்.', te: 'ఫోన్‌లో సేవ్ అయింది. లైట్ ప్యాక్‌లో వీడియో లేదు; చూడటానికి పూర్తి ప్యాక్ డౌన్‌లోడ్ చేయండి.', gu: 'ફોનમાં સાચવ્યું. લાઇટ પૅકમાં વિડિયો નથી; જોવા સંપૂર્ણ પૅક ડાઉનલોડ કરો.',
  },
  'lesson.savedOnDevice': {
    en: 'This lesson is saved on your device and can be studied without an internet connection.', hi: 'यह पाठ आपके डिवाइस पर सहेजा गया है और इंटरनेट के बिना पढ़ा जा सकता है।', mr: 'हा धडा डिव्हाइसवर जतन आहे आणि इंटरनेटशिवाय अभ्यासता येतो.', bn: 'এই পাঠটি ডিভাইসে সংরক্ষিত, ইন্টারনেট ছাড়াই পড়তে পারবেন।', ta: 'இந்த பாடம் சாதனத்தில் சேமிக்கப்பட்டுள்ளது; இணையமின்றி படிக்கலாம்.', te: 'ఈ పాఠం మీ పరికరంలో సేవ్ అయింది, ఇంటర్నెట్ లేకుండా చదవవచ్చు.', gu: 'આ પાઠ ઉપકરણમાં સાચવ્યો છે અને ઇન્ટરનેટ વિના ભણી શકાય છે.',
  },
  'lesson.askAI': {
    en: 'Ask GyanSetu AI', hi: 'GyanSetu AI से पूछें', mr: 'GyanSetu AI ला विचारा', bn: 'GyanSetu AI-কে জিজ্ঞাসা করুন', ta: 'GyanSetu AI-யிடம் கேளுங்கள்', te: 'GyanSetu AIని అడగండి', gu: 'GyanSetu AIને પૂછો',
  },
  'lesson.askDoubts': {
    en: 'Ask doubts about this lesson', hi: 'इस पाठ के बारे में सवाल पूछें', mr: 'या धड्याबद्दल शंका विचारा', bn: 'এই পাঠ সম্পর্কে প্রশ্ন করুন', ta: 'இந்த பாடத்தைப் பற்றி கேள்விகள் கேளுங்கள்', te: 'ఈ పాఠం గురించి సందేహాలు అడగండి', gu: 'આ પાઠ વિશે પ્રશ્નો પૂછો',
  },
  'lesson.myNotes': {
    en: 'My Notes', hi: 'मेरे नोट्स', mr: 'माझ्या नोंदी', bn: 'আমার নোট', ta: 'எனது குறிப்புகள்', te: 'నా నోట్స్', gu: 'મારી નોંધો',
  },
  'lesson.addNotes': {
    en: 'Add Notes', hi: 'नोट्स जोड़ें', mr: 'नोंदी जोडा', bn: 'নোট যোগ করুন', ta: 'குறிப்புகளைச் சேர்க்கவும்', te: 'నోట్స్ జోడించండి', gu: 'નોંધ ઉમેરો',
  },
  'lesson.savedOnPhone': {
    en: 'Saved on this phone ✓', hi: 'इस फोन पर सहेजा गया ✓', mr: 'या फोनवर जतन केले ✓', bn: 'এই ফোনে সংরক্ষিত ✓', ta: 'இந்த போனில் சேமிக்கப்பட்டது ✓', te: 'ఈ ఫోన్‌లో సేవ్ అయింది ✓', gu: 'આ ફોનમાં સાચવ્યું ✓',
  },
  'lesson.savePersonalNotes': {
    en: 'Save your personal notes', hi: 'अपने निजी नोट्स सहेजें', mr: 'तुमच्या वैयक्तिक नोंदी जतन करा', bn: 'আপনার ব্যক্তিগত নোট সংরক্ষণ করুন', ta: 'உங்கள் தனிப்பட்ட குறிப்புகளைச் சேமிக்கவும்', te: 'మీ వ్యక్తిగత నోట్స్‌ను సేవ్ చేయండి', gu: 'તમારી વ્યક્તિગત નોંધો સાચવો',
  },
  'lesson.writeNotes': {
    en: 'Write anything you want to remember…', hi: 'जो याद रखना चाहते हैं, लिखें…', mr: 'लक्षात ठेवायचे ते लिहा…', bn: 'যা মনে রাখতে চান লিখুন…', ta: 'நினைவில் வைக்க விரும்புவதை எழுதவும்…', te: 'మీరు గుర్తుంచుకోవాలనుకునేది రాయండి…', gu: 'યાદ રાખવું હોય તે લખો…',
  },
  'lesson.saveNote': {
    en: 'Save note', hi: 'नोट सहेजें', mr: 'नोंद जतन करा', bn: 'নোট সংরক্ষণ করুন', ta: 'குறிப்பைச் சேமிக்கவும்', te: 'నోట్ సేవ్ చేయండి', gu: 'નોંધ સાચવો',
  },
  'lesson.deleteNote': {
    en: 'Delete note', hi: 'नोट हटाएं', mr: 'नोंद हटवा', bn: 'নোট মুছুন', ta: 'குறிப்பை நீக்கவும்', te: 'నోట్‌ను తొలగించండి', gu: 'નોંધ કાઢી નાખો',
  },
  'lesson.lessonCompleted': {
    en: '✓ Lesson Completed', hi: '✓ पाठ पूरा हुआ', mr: '✓ धडा पूर्ण झाला', bn: '✓ পাঠ সম্পন্ন', ta: '✓ பாடம் முடிந்தது', te: '✓ పాఠం పూర్తయింది', gu: '✓ પાઠ પૂર્ણ થયો',
  },
  'lesson.markCompleted': {
    en: '✓ Mark as Completed', hi: '✓ पूरा हुआ चिह्नित करें', mr: '✓ पूर्ण म्हणून चिन्हांकित करा', bn: '✓ সম্পন্ন হিসেবে চিহ্নিত করুন', ta: '✓ முடிந்ததாகக் குறிக்கவும்', te: '✓ పూర్తయినట్లు గుర్తించండి', gu: '✓ પૂર્ણ તરીકે ચિહ્નિત કરો',
  },
  'lesson.previous': {
    en: 'Previous', hi: 'पिछला', mr: 'मागील', bn: 'আগের', ta: 'முந்தைய', te: 'మునుపటి', gu: 'પાછળ',
  },
  'lesson.next': {
    en: 'Next', hi: 'अगला', mr: 'पुढील', bn: 'পরের', ta: 'அடுத்து', te: 'తదుపరి', gu: 'આગળ',
  },
  'courseDetails.downloading': {
    en: 'Downloading {{received}} of {{total}}…', hi: '{{total}} में से {{received}} डाउनलोड हो रहा है…', mr: '{{total}} पैकी {{received}} डाउनलोड होत आहे…', bn: '{{total}}-এর মধ্যে {{received}} ডাউনলোড হচ্ছে…', ta: '{{total}} இல் {{received}} பதிவிறக்கப்படுகிறது…', te: '{{total}}లో {{received}} డౌన్‌లోడ్ అవుతోంది…', gu: '{{total}}માંથી {{received}} ડાઉનલોડ થઈ રહ્યું છે…',
  },
  'courseDetails.update': {
    en: 'Update', hi: 'अपडेट करें', mr: 'अपडेट करा', bn: 'আপডেট করুন', ta: 'புதுப்பிக்கவும்', te: 'నవీకరించండి', gu: 'અપડેટ કરો',
  },
  'courseDetails.ready': {
    en: 'Ready', hi: 'तैयार', mr: 'तयार', bn: 'প্রস্তুত', ta: 'தயார்', te: 'సిద్ధంగా ఉంది', gu: 'તૈયાર',
  },
  'courseDetails.updateWhenOnline': {
    en: 'Update when online', hi: 'ऑनलाइन होने पर अपडेट करें', mr: 'ऑनलाइन असताना अपडेट करा', bn: 'অনলাইনে এলে আপডেট করুন', ta: 'ஆன்லைனில் இருக்கும்போது புதுப்பிக்கவும்', te: 'ఆన్‌లైన్‌లో ఉన్నప్పుడు నవీకరించండి', gu: 'ઓનલાઇન હો ત્યારે અપડેટ કરો',
  },
  'courseDetails.completedLessons': {
    en: '{{completed}} of {{total}} lessons completed', hi: '{{total}} में से {{completed}} पाठ पूरे', mr: '{{total}} पैकी {{completed}} धडे पूर्ण', bn: '{{total}}টির মধ্যে {{completed}}টি পাঠ সম্পন্ন', ta: '{{total}} இல் {{completed}} பாடங்கள் முடிந்தன', te: '{{total}}లో {{completed}} పాఠాలు పూర్తయ్యాయి', gu: '{{total}}માંથી {{completed}} પાઠ પૂર્ણ',
  },
  'courseDetails.moreLessons': {
    en: '+ {{count}} more lesson(s) in the full course', hi: 'पूरा कोर्स में + {{count}} और पाठ', mr: 'पूर्ण कोर्समध्ये आणखी + {{count}} धडे', bn: 'সম্পূর্ণ কোর্সে আরও + {{count}}টি পাঠ', ta: 'முழு கோர்ஸில் மேலும் + {{count}} பாடங்கள்', te: 'పూర్తి కోర్సులో మరో + {{count}} పాఠాలు', gu: 'સંપૂર્ણ કોર્સમાં વધુ + {{count}} પાઠ',
  },
  'courseDetails.lessonDuration': {
    en: '{{minutes}} min', hi: '{{minutes}} मिनट', mr: '{{minutes}} मिनिटे', bn: '{{minutes}} মিনিট', ta: '{{minutes}} நிமிடம்', te: '{{minutes}} నిమిషాలు', gu: '{{minutes}} મિનિટ',
  },
  'courseDetails.questionCount': {
    en: '{{count}} questions', hi: '{{count}} प्रश्न', mr: '{{count}} प्रश्न', bn: '{{count}}টি প্রশ্ন', ta: '{{count}} கேள்விகள்', te: '{{count}} ప్రశ్నలు', gu: '{{count}} પ્રશ્નો',
  },
};

export function getScreenExtra(key: string, language: SupportedLanguage): string | undefined {
  return Object.hasOwn(SCREEN_EXTRAS, key)
    ? SCREEN_EXTRAS[key as TranslationKey]?.[language]
    : undefined;
}
