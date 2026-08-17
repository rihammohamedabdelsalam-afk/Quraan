export default function App() {
  return (
    <main style={{ fontFamily: 'Tahoma, sans-serif', padding: '2rem', direction: 'rtl' }}>
      <h1>نظام إدارة حصص المعلمة</h1>
      <p>التطبيق جاهز للـ deployment على Cloudflare Pages.</p>
      <p>قم بإضافة متغيرات البيئة من إعدادات المشروع في Cloudflare:</p>
      <ul>
        <li>VITE_SUPABASE_URL</li>https://motokkwnjtjojaafylrx.supabase.co
        <li>VITE_SUPABASE_ANON_KEY</li>sb_publishable_ze5RlX8nii3aTrRqyhjPng_fRBlUHXW
      </ul>
    </main>
  );
}
