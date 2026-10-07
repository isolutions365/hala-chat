export function callErrorMessage(name: string, isRtl: boolean): string {
 const messages: Record<string, [string,string]> = {
  NetworkError: ['The call connection was lost or could not be established. Microphone and camera have been stopped. End this call, check your network and try again.', 'انقطع اتصال المكالمة أو تعذر إنشاؤه. تم إيقاف الميكروفون والكاميرا. أنهِ المكالمة وتحقق من الشبكة ثم حاول مجدداً.'],
  NotAllowedError: ['Allow microphone/camera access in browser settings, then end this call and try again.', 'اسمح بالوصول إلى الميكروفون والكاميرا في إعدادات المتصفح، ثم أنهِ المكالمة وحاول مجدداً.'],
  NotFoundError: ['No microphone or camera was found. Connect a device, then call again.', 'لم يتم العثور على ميكروفون أو كاميرا. وصّل جهازاً ثم اتصل مجدداً.'],
  NotReadableError: ['Your microphone or camera may be busy. Close other apps using it, then call again.', 'قد يكون الميكروفون أو الكاميرا قيد الاستخدام. أغلق التطبيقات الأخرى ثم اتصل مجدداً.'],
  NotSupportedError: ['Calling is unavailable in this browser. Try a supported browser over HTTPS.', 'المكالمات غير متاحة في هذا المتصفح. جرّب متصفحاً يدعم المكالمات عبر HTTPS.'],
 };
 const fallback: [string,string] = ['The call could not start. Check your connection and device permissions, then end this call and try again.', 'تعذر بدء المكالمة. تحقق من الاتصال وأذونات الجهاز، ثم أنهِ المكالمة وحاول مجدداً.'];
 return (messages[name] || fallback)[isRtl ? 1 : 0];
}
