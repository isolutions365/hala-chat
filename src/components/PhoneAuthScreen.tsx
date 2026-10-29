import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ArrowLeft, ArrowRight, Check, X, AlertCircle } from 'lucide-react';
import { Language, Country } from '../types';
import { GULF_COUNTRIES, OTHER_COUNTRIES, validatePhoneNumber } from '../lib/countries';

interface PhoneAuthScreenProps {
  language: Language;
  initialCountry: Country;
  onBack: () => void;
  onSendOtp: (fullNumber: string, country: Country) => Promise<{ success: boolean; error?: string }>;
  isLoading: boolean;
  onOpenTerms: () => void;
}

export const PhoneAuthScreen: React.FC<PhoneAuthScreenProps> = ({
  language,
  initialCountry,
  onBack,
  onSendOtp,
  isLoading,
  onOpenTerms,
}) => {
  const [selectedCountry, setSelectedCountry] = useState<Country>(initialCountry);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const isRtl = language === 'ar';

  // Real-time phone validation
  useEffect(() => {
    if (!phoneNumber.trim()) {
      setValidationError(null);
      setServerError(null);
      return;
    }
    const { error } = validatePhoneNumber(phoneNumber, selectedCountry, language);
    setValidationError(error);
    setServerError(null);
  }, [phoneNumber, selectedCountry, language]);

  const digitsOnly = phoneNumber.replace(/\D/g, '');
  const isValid = digitsOnly.length >= selectedCountry.minDigits && digitsOnly.length <= selectedCountry.maxDigits;

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^\d\s-]/g, '');
    setPhoneNumber(val);
  };

  const handleCountrySelect = (country: Country) => {
    setSelectedCountry(country);
    setIsDropdownOpen(false);
    setSearchQuery('');
    setServerError(null);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isLoading) return;
    setServerError(null);
    const fullNumber = `${selectedCountry.dialCode}${digitsOnly}`;
    const result = await onSendOtp(fullNumber, selectedCountry);
    if (result && !result.success && result.error) {
      setServerError(result.error);
    }
  };

  // Filter countries for dropdown
  const filteredGulf = GULF_COUNTRIES.filter(
    (c) =>
      c.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.nameAr.includes(searchQuery) ||
      c.dialCode.includes(searchQuery)
  );

  const filteredOthers = OTHER_COUNTRIES.filter(
    (c) =>
      c.nameEn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.nameAr.includes(searchQuery) ||
      c.dialCode.includes(searchQuery)
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: isRtl ? -40 : 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: isRtl ? 40 : -40 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="w-full h-full flex flex-col justify-between px-6 py-6 bg-slate-50 text-slate-900 min-h-[580px] overflow-y-auto"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      {/* Top Header */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={onBack}
            className="w-11 h-11 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer shadow-2xs"
            aria-label={isRtl ? 'رجوع' : 'Back'}
          >
            {isRtl ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
          </button>

          <div className="flex items-center gap-1.5 px-3 py-1 bg-[#087F75]/10 text-[#087F75] rounded-full text-xs font-semibold">
            <span className="w-2 h-2 rounded-full bg-[#087F75] animate-pulse"></span>
            <span>{isRtl ? 'الخطوة ١ من ٢' : 'Step 1 of 2'}</span>
          </div>
        </div>

        {/* Heading */}
        <h2 className="text-2xl font-bold text-slate-900 mb-1 tracking-tight">
          {isRtl ? 'أدخل رقم هاتفك' : 'Enter your phone number'}
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          {isRtl
            ? 'سنرسل لك رمز تحقق عبر الرسائل النصية OTP لإنشاء حسابك وتوثيقه'
            : 'We will send a real SMS verification code (OTP) via Firebase to confirm your number'}
        </p>

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700 block">
              {isRtl ? 'رقم الجوال' : 'Mobile Number'}
            </label>

            {/* Country Selector & Input Container */}
            <div className="relative flex items-center">
              {/* Country Code Dropdown Button */}
              <button
                type="button"
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`flex items-center gap-1.5 px-3 h-[52px] min-h-[44px] bg-white border ${
                  validationError || serverError ? 'border-red-300 bg-red-50/20' : 'border-slate-300 hover:border-slate-400'
                } ${
                  isRtl ? 'rounded-r-xl border-l-0' : 'rounded-l-xl border-r-0'
                } transition-colors cursor-pointer focus:outline-hidden shrink-0 select-none`}
              >
                <span className="text-xl leading-none">{selectedCountry.flag}</span>
                <span className="text-sm font-semibold text-slate-800 font-mono" dir="ltr">
                  {selectedCountry.dialCode}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>

              {/* Input Field */}
              <div className="relative flex-1">
                <input
                  ref={inputRef}
                  type="tel"
                  value={phoneNumber}
                  onChange={handlePhoneChange}
                  placeholder={selectedCountry.placeholder}
                  className={`w-full h-[52px] min-h-[44px] bg-white border ${
                    validationError || serverError ? 'border-red-300 text-red-900 bg-red-50/20' : 'border-slate-300 text-slate-900 focus:border-[#087F75]'
                  } ${
                    isRtl ? 'rounded-l-xl pl-10 pr-3' : 'rounded-r-xl pr-10 pl-3'
                  } text-base font-medium placeholder-slate-400 focus:outline-hidden transition-colors font-mono tracking-wider`}
                  dir="ltr"
                  autoFocus
                />

                {/* Clear Input Button */}
                {phoneNumber && (
                  <button
                    type="button"
                    onClick={() => {
                      setPhoneNumber('');
                      setServerError(null);
                    }}
                    className={`absolute top-1/2 -translate-y-1/2 ${
                      isRtl ? 'left-3' : 'right-3'
                    } text-slate-400 hover:text-slate-600 p-1 rounded-full`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Inline Validation Error */}
            <AnimatePresence>
              {validationError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-1.5 text-xs text-red-600 pt-1"
                >
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{validationError}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Inline Firebase Backend Error (Rate limit, invalid number, network error) */}
            <AnimatePresence>
              {serverError && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2 mt-2"
                >
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">{isRtl ? 'خطأ في المصادقة:' : 'Authentication error:'} </span>
                    <span>{serverError}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>


        </form>
      </div>

      {/* Country Selector Modal Dropdown */}
      <AnimatePresence>
        {isDropdownOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setIsDropdownOpen(false)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-md max-h-[80vh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
              dir={isRtl ? 'rtl' : 'ltr'}
            >
              {/* Dropdown Header */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-semibold text-slate-900 text-base">
                  {isRtl ? 'اختر الدولة' : 'Select Country'}
                </h3>
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search Field */}
              <div className="p-3 bg-slate-50 border-b border-slate-100">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={isRtl ? 'بحث باسم الدولة أو الرمز...' : 'Search country or code...'}
                  className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm placeholder-slate-400 focus:outline-hidden focus:border-[#087F75]"
                />
              </div>

              {/* Country List */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                {/* Gulf Section Header */}
                <div className="bg-slate-50/80 px-4 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {isRtl ? 'دول الخليج العربي' : 'Gulf Countries'}
                </div>
                {filteredGulf.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => handleCountrySelect(c)}
                    className={`w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors text-left min-h-[44px] ${
                      selectedCountry.code === c.code ? 'bg-[#087F75]/5 text-[#087F75] font-medium' : 'text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{c.flag}</span>
                      <span className="text-sm font-medium">
                        {isRtl ? c.nameAr : c.nameEn}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-slate-500" dir="ltr">
                        {c.dialCode}
                      </span>
                      {selectedCountry.code === c.code && <Check className="w-4 h-4 text-[#087F75]" />}
                    </div>
                  </button>
                ))}

                {/* Other Section Header */}
                <div className="bg-slate-50/80 px-4 py-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {isRtl ? 'دول أخرى' : 'Other Countries'}
                </div>
                {filteredOthers.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => handleCountrySelect(c)}
                    className={`w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors text-left min-h-[44px] ${
                      selectedCountry.code === c.code ? 'bg-[#087F75]/5 text-[#087F75] font-medium' : 'text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{c.flag}</span>
                      <span className="text-sm font-medium">
                        {isRtl ? c.nameAr : c.nameEn}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-slate-500" dir="ltr">
                        {c.dialCode}
                      </span>
                      {selectedCountry.code === c.code && <Check className="w-4 h-4 text-[#087F75]" />}
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Actions */}
      <div className="w-full flex flex-col items-center gap-4 pt-4">
        {/* Send OTP Primary Button */}
        <motion.button
          type="button"
          whileHover={isValid ? { scale: 1.01 } : {}}
          whileTap={isValid ? { scale: 0.98 } : {}}
          onClick={handleSubmit}
          disabled={!isValid || isLoading}
          className={`w-full h-[52px] min-h-[44px] font-semibold text-base rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
            isValid && !isLoading
              ? 'bg-[#087F75] hover:bg-[#06685F] text-white shadow-md shadow-[#087F75]/20'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
          }`}
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              <span>{isRtl ? 'جاري إرسال الرمز...' : 'Sending SMS OTP...'}</span>
            </div>
          ) : (
            <span>{isRtl ? 'إرسال رمز التحقق (OTP)' : 'Send OTP'}</span>
          )}
        </motion.button>

        {/* Small Privacy Terms Links */}
        <button
          type="button"
          onClick={onOpenTerms}
          className="text-xs text-slate-400 hover:text-slate-600 text-center transition-colors px-2 cursor-pointer focus:outline-hidden"
        >
          {isRtl ? 'شروط الخدمة وسياستنا للخصوصية' : 'Terms of Service & Privacy Policy'}
        </button>
      </div>
    </motion.div>
  );
};
