import React, { useState } from 'react';
import {
  SoundKind,
  SoundPreferences,
  GroupNotificationSetting,
  SOUND_PRESETS,
  DEFAULT_SOUND_PREFERENCES,
  readSoundPreferences,
  saveSoundPreferences,
  previewTone,
} from '../lib/sounds';
import {
  Bell,
  Volume2,
  Users,
  PhoneCall,
  PhoneOutgoing,
  Vibrate,
  Play,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
  Check,
} from 'lucide-react';

interface NotificationSoundsSettingsProps {
  isRtl: boolean;
  onClose: () => void;
}

export const NotificationSoundsSettings: React.FC<NotificationSoundsSettingsProps> = ({
  isRtl,
  onClose,
}) => {
  const [prefs, setPrefs] = useState<SoundPreferences>(readSoundPreferences);
  const [playingKind, setPlayingKind] = useState<SoundKind | null>(null);

  const updatePreference = <K extends keyof SoundPreferences>(
    key: K,
    val: SoundPreferences[K]
  ) => {
    const updated = { ...prefs, [key]: val };
    setPrefs(updated);
    saveSoundPreferences(updated);
  };

  const handlePreview = (kind: SoundKind, presetId: string) => {
    setPlayingKind(kind);
    previewTone(kind, presetId);
    setTimeout(() => {
      setPlayingKind((current) => (current === kind ? null : current));
    }, 1200);
  };

  const handleReset = () => {
    setPrefs(DEFAULT_SOUND_PREFERENCES);
    saveSoundPreferences(DEFAULT_SOUND_PREFERENCES);
  };

  const selectClasses =
    'block w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#087F75]/30 focus:border-[#087F75] transition-all cursor-pointer';

  return (
    <div className="flex flex-col h-full max-h-[85vh] bg-white" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            aria-label={isRtl ? 'رجوع' : 'Back'}
          >
            {isRtl ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
          </button>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">
              {isRtl ? 'نغمات الإشعارات والمكالمات' : 'Notification & Call Tones'}
            </h3>
            <p className="text-[10px] text-slate-500">
              {isRtl ? 'تخصيص نغمات التنبيه والاهتزاز لهذا الجهاز' : 'Customize alert tones and vibration for this device'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-[#087F75] p-1.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          title={isRtl ? 'استعادة الافتراضي' : 'Reset to default'}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{isRtl ? 'افتراضي' : 'Reset'}</span>
        </button>
      </div>

      {/* Settings Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Master Sound Toggle */}
        <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-orange-100 text-orange-700">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900">
                {isRtl ? 'أصوات الإشعارات' : 'Notification Sounds'}
              </h4>
              <p className="text-[10px] text-slate-500">
                {isRtl ? 'تشغيل نغمة عند وصول رسائل جديدة' : 'Play tone when new messages arrive'}
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={prefs.messageSoundEnabled}
            onClick={() => updatePreference('messageSoundEnabled', !prefs.messageSoundEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
              prefs.messageSoundEnabled ? 'bg-[#087F75]' : 'bg-slate-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                prefs.messageSoundEnabled ? (isRtl ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* 1-1 Message Tone Picker */}
        <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-teal-100 text-[#087F75]">
                <Volume2 className="w-4 h-4" />
              </div>
              <label htmlFor="message-tone-select" className="text-xs font-bold text-slate-900">
                {isRtl ? 'نغمة الرسائل الفردية (1-1)' : 'Direct Message Tone'}
              </label>
            </div>

            <button
              type="button"
              onClick={() => handlePreview('message', prefs.messageTone)}
              className="flex items-center gap-1 text-[11px] font-bold text-[#087F75] bg-white border border-teal-200 hover:bg-teal-50 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shadow-2xs"
            >
              <Play className={`w-3 h-3 fill-current ${playingKind === 'message' ? 'animate-pulse' : ''}`} />
              <span>{isRtl ? 'معاينة' : 'Preview'}</span>
            </button>
          </div>

          <select
            id="message-tone-select"
            className={selectClasses}
            value={prefs.messageTone}
            onChange={(e) => updatePreference('messageTone', e.target.value)}
          >
            {SOUND_PRESETS.message.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {isRtl ? preset.nameAr : preset.nameEn}
              </option>
            ))}
          </select>
        </div>

        {/* Group Tone Picker */}
        <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-purple-100 text-purple-700">
                <Users className="w-4 h-4" />
              </div>
              <label htmlFor="group-tone-select" className="text-xs font-bold text-slate-900">
                {isRtl ? 'نغمة رسائل المجموعات' : 'Group Message Tone'}
              </label>
            </div>

            <button
              type="button"
              onClick={() => handlePreview('group', prefs.groupTone)}
              className="flex items-center gap-1 text-[11px] font-bold text-purple-700 bg-white border border-purple-200 hover:bg-purple-50 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shadow-2xs"
            >
              <Play className={`w-3 h-3 fill-current ${playingKind === 'group' ? 'animate-pulse' : ''}`} />
              <span>{isRtl ? 'معاينة' : 'Preview'}</span>
            </button>
          </div>

          <select
            id="group-tone-select"
            className={selectClasses}
            value={prefs.groupTone}
            onChange={(e) => updatePreference('groupTone', e.target.value)}
          >
            {SOUND_PRESETS.group.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {isRtl ? preset.nameAr : preset.nameEn}
              </option>
            ))}
          </select>
        </div>

        {/* Group Notifications Filter Setting */}
        <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2 shadow-2xs">
          <label className="text-xs font-bold text-slate-900 block">
            {isRtl ? 'تنبيهات المجموعات' : 'Group Notifications'}
          </label>
          <p className="text-[10px] text-slate-500">
            {isRtl ? 'اختر متى ترغب في استلام إشعار للرسائل في المجموعات' : 'Choose when you want to receive alerts from groups'}
          </p>

          <div className="grid grid-cols-3 gap-1.5 pt-1">
            {[
              {
                id: 'mentions',
                labelEn: 'Mentions & Replies',
                labelAr: 'الإشارات والردود',
                descEn: 'Default',
                descAr: 'افتراضي',
              },
              {
                id: 'all',
                labelEn: 'All Messages',
                labelAr: 'جميع الرسائل',
                descEn: 'Every message',
                descAr: 'كل رسالة',
              },
              {
                id: 'off',
                labelEn: 'Muted',
                labelAr: 'مكتومة',
                descEn: 'No alerts',
                descAr: 'بدون تنبيهات',
              },
            ].map((opt) => {
              const isSelected = prefs.groupNotifications === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => updatePreference('groupNotifications', opt.id as GroupNotificationSetting)}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl text-center border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#087F75] bg-[#087F75]/10 text-[#087F75] font-bold shadow-2xs'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="text-[11px] leading-tight">{isRtl ? opt.labelAr : opt.labelEn}</span>
                  <span className="text-[9px] opacity-70 mt-0.5">{isRtl ? opt.descAr : opt.descEn}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Incoming Call Ringtone */}
        <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-green-100 text-green-700">
                <PhoneCall className="w-4 h-4" />
              </div>
              <label htmlFor="call-tone-select" className="text-xs font-bold text-slate-900">
                {isRtl ? 'رنة المكالمات الواردة' : 'Incoming Call Ringtone'}
              </label>
            </div>

            <button
              type="button"
              onClick={() => handlePreview('call', prefs.callTone)}
              className="flex items-center gap-1 text-[11px] font-bold text-green-700 bg-white border border-green-200 hover:bg-green-50 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shadow-2xs"
            >
              <Play className={`w-3 h-3 fill-current ${playingKind === 'call' ? 'animate-pulse' : ''}`} />
              <span>{isRtl ? 'معاينة' : 'Preview'}</span>
            </button>
          </div>

          <select
            id="call-tone-select"
            className={selectClasses}
            value={prefs.callTone}
            onChange={(e) => updatePreference('callTone', e.target.value)}
          >
            {SOUND_PRESETS.call.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {isRtl ? preset.nameAr : preset.nameEn}
              </option>
            ))}
          </select>
        </div>

        {/* Outgoing Ringback Tone */}
        <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl space-y-2.5 shadow-2xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-blue-100 text-blue-700">
                <PhoneOutgoing className="w-4 h-4" />
              </div>
              <label htmlFor="ringback-tone-select" className="text-xs font-bold text-slate-900">
                {isRtl ? 'نغمة الاتصال الصادر (الرنين)' : 'Outgoing Ringback Tone'}
              </label>
            </div>

            <button
              type="button"
              onClick={() => handlePreview('ringback', prefs.ringbackTone)}
              className="flex items-center gap-1 text-[11px] font-bold text-blue-700 bg-white border border-blue-200 hover:bg-blue-50 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shadow-2xs"
            >
              <Play className={`w-3 h-3 fill-current ${playingKind === 'ringback' ? 'animate-pulse' : ''}`} />
              <span>{isRtl ? 'معاينة' : 'Preview'}</span>
            </button>
          </div>

          <select
            id="ringback-tone-select"
            className={selectClasses}
            value={prefs.ringbackTone}
            onChange={(e) => updatePreference('ringbackTone', e.target.value)}
          >
            {SOUND_PRESETS.ringback.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {isRtl ? preset.nameAr : preset.nameEn}
              </option>
            ))}
          </select>
        </div>

        {/* Vibration Toggle */}
        <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
              <Vibrate className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900">
                {isRtl ? 'الاهتزاز عند الاتصال' : 'Call Vibration'}
              </h4>
              <p className="text-[10px] text-slate-500">
                {isRtl ? 'اهتزاز الهاتف عند استقبال مكالمة واردة' : 'Vibrate device during incoming calls'}
              </p>
            </div>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={prefs.vibrationEnabled}
            onClick={() => updatePreference('vibrationEnabled', !prefs.vibrationEnabled)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
              prefs.vibrationEnabled ? 'bg-[#087F75]' : 'bg-slate-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                prefs.vibrationEnabled ? (isRtl ? '-translate-x-5' : 'translate-x-5') : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-center gap-1 text-[11px] text-slate-400 py-1 font-medium">
          <Check className="w-3 h-3 text-[#087F75]" />
          <span>{isRtl ? 'يتم حفظ التفضيلات تلقائياً على هذا الجهاز' : 'Settings saved automatically on this device'}</span>
        </div>
      </div>
    </div>
  );
};
