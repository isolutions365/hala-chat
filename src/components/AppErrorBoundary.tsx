import React from 'react';

// Catch rejected lazy imports as well as render errors. Never reload automatically:
// users may need to preserve text in another tab or restore their connection first.
export class AppErrorBoundary extends React.Component<{children:React.ReactNode},{failed:boolean}> {
 declare props:{children:React.ReactNode};
 state={failed:false};
 static getDerivedStateFromError(){return {failed:true};}
 render(){
  if(!this.state.failed)return this.props.children;
  return <main className="min-h-screen bg-[#112330] text-white flex items-center justify-center p-6">
   <section role="alert" className="w-full max-w-md space-y-4">
    <h1 className="text-2xl font-bold" dir="rtl" lang="ar">تعذر تحميل هذه الشاشة</h1>
    <p dir="rtl" lang="ar">تحقق من الاتصال ثم أعد تحميل هلا. قد تحتاج لإعادة اختيار المرفقات غير المنشورة.</p>
    <h2 className="text-xl font-bold" lang="en">This screen could not load</h2>
    <p lang="en">Check your connection, then reload Hala. You may need to reselect unpublished attachments.</p>
    <button type="button" onClick={()=>window.location.reload()} className="min-h-11 rounded-xl bg-[#9BE8CF] text-[#112330] px-5 py-3 font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">إعادة تحميل هلا / Reload Hala</button>
   </section>
  </main>;
 }
}
