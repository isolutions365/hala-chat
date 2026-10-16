import React, {useEffect, useRef, useState} from 'react';

export function CreatorIdShare({id, isRtl}: {id: string; isRtl: boolean; key?: string}) {
 const [state, setState] = useState<'idle' | 'copying' | 'copied' | 'manual'>('idle');
 const active = useRef(true);
 const busy = useRef(false);
 useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
 const copy = async () => {
  if (busy.current) return;
  busy.current = true;
  setState('copying');
  try {
   await navigator.clipboard.writeText(id);
   if (active.current) setState('copied');
  } catch {
   if (active.current) setState('manual');
  } finally { busy.current = false; }
 };
 return <div className="mt-2">
  <p className="text-xs break-all select-all" dir="ltr">Hala ID: {id}</p>
  <button type="button" onClick={copy} disabled={state === 'copying'} className="mt-2 min-h-11 px-3 py-2 rounded-xl border border-white/30 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60">
   {state === 'copying' ? (isRtl ? 'جارٍ النسخ…' : 'Copying…') : (isRtl ? 'نسخ معرّف Hala' : 'Copy Hala ID')}
  </button>
  <p role="status" className="text-sm mt-1">{state === 'copied' ? (isRtl ? 'تم نسخ معرّف Hala.' : 'Hala ID copied.') : state === 'manual' ? (isRtl ? 'تعذر النسخ التلقائي. حدد المعرّف أدناه وانسخه يدوياً.' : 'Automatic copy was unavailable. Select the ID below and copy it manually.') : ''}</p>
  {state === 'manual' && <label className="block text-sm mt-2">{isRtl ? 'معرّف Hala للنسخ' : 'Hala ID to copy'}<input readOnly value={id} dir="ltr" onFocus={event => event.currentTarget.select()} className="block mt-1 w-full min-h-11 rounded-xl border border-white/30 bg-transparent px-3 select-all focus-visible:outline focus-visible:outline-2"/></label>}
 </div>;
}
