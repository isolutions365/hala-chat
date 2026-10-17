export function createCallConnectionWatch(onFailure: () => void) {
 let timer: ReturnType<typeof setTimeout> | undefined;
 let pending = '';
 let disposed = false;
 const clear = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; pending = ''; };
 const fail = () => { if (disposed) return; clear(); disposed = true; onFailure(); };
 return {
  update(state: string) {
   if (disposed) return;
   if (state === 'failed') { fail(); return; }
   if (state === 'closed') { clear(); disposed = true; return; }
   if (state === 'connected' || state === 'new') { clear(); return; }
   if (state !== 'connecting' && state !== 'disconnected') return;
   if (pending === state) return;
   clear(); pending = state;
   timer = setTimeout(fail, state === 'disconnected' ? 15000 : 30000);
  },
  dispose() { clear(); disposed = true; },
 };
}
