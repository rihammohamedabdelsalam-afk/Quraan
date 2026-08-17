# تثبيت وتكوين PWA

## ✅ ما تم إنجازه

تم تحويل تطبيق نظام إدارة حصص المعلمة إلى تطبيق ويب تقدمي (PWA) كامل وقابل للتثبيت على:
- ✅ Android (Chrome)
- ✅ Windows (Chrome, Edge)
- ✅ macOS (Safari)

## 📱 الميزات المضافة

### 1. **Web App Manifest**
- ملف `manifest.json` في المجلد `public/`
- اسم التطبيق: "نظام إدارة حصص المعلمة"
- الاسم المختصر: "إدارة الحصص"
- اتجاه RTL دعماً للعربية
- تطبيق مستقل بدون شريط المتصفح
- ألوان: أزرق (#3B82F6) مع خلفية بيضاء

### 2. **أيقونات PWA**
- **192x192px**: للهواتف والأجهزة الصغيرة
- **512x512px**: للشاشات الكبيرة
- **Maskable Icons**: للأيقونات المحسّنة على iOS

الأيقونات موجودة في:
- `public/icon-192x192.png`
- `public/icon-512x512.png`

### 3. **Service Worker**
يتم توليده تلقائياً باستخدام Workbox:
- ✅ تخزين مؤقت للملفات الثابتة
- ✅ عمل بدون اتصال بالإنترنت (للملفات المخزنة)
- ✅ تحديث تلقائي
- ✅ دعم كامل لـ Supabase (Network First)

### 4. **التوافقية والأمان**
- ✅ HTTPS متطلب (Cloudflare Pages يوفره)
- ✅ لا توجد مفاتيح سرية في الكود
- ✅ متغيرات البيئة محمية
- ✅ Compatible مع Cloudflare Pages

## 🚀 كيفية التثبيت والاستخدام

### على Chrome/Edge (Windows و Android):

1. **افتح التطبيق على المتصفح**
   ```
   https://yourapp.pages.dev
   ```

2. **على Windows:**
   - انقر على أيقونة القائمة (⋮) في الزاوية العلوية اليمين
   - اختر "تثبيت التطبيق" أو "Install app"
   - أكّد التثبيت

3. **على Android:**
   - بعد زيارة الموقع، سيظهر تنبيه بـ "تثبيت التطبيق"
   - انقر على "تثبيت" Install
   - التطبيق يظهر في الشاشة الرئيسية كتطبيق مستقل

### على Safari (iOS):

1. افتح الموقع في Safari
2. انقر على أيقونة المشاركة (↗)
3. اختر "إضافة إلى الشاشة الرئيسية"
4. سيظهر التطبيق كأيقونة في الشاشة الرئيسية

## 📝 متطلبات البيئة

قم بإنشاء ملف `.env.local` في جذر المشروع:

```env
VITE_SUPABASE_URL=https://your-project-url.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

## 🔧 الملفات المضافة/المعدلة

### ملفات جديدة:
- ✅ `public/manifest.json` - Web App Manifest
- ✅ `public/icon-192x192.png` - أيقونة PWA (192x192)
- ✅ `public/icon-512x512.png` - أيقونة PWA (512x512)
- ✅ `generate-icons.js` - سكريبت توليد الأيقونات
- ✅ `PWA_SETUP.md` - هذا الملف

### ملفات معدلة:
- ✅ `vite.config.ts` - إضافة vite-plugin-pwa
- ✅ `index.html` - إضافة Meta tags للمتصفح والأيقونات
- ✅ `src/main.tsx` - تسجيل Service Worker
- ✅ `tsconfig.json` - إضافة WebWorker support
- ✅ `.env.example` - إزالة المفاتيح الحقيقية

## 🛠️ الأوامر المتاحة

```bash
# تطوير محلي
npm run dev

# البناء للإنتاج
npm run build

# معاينة الإصدار النهائي
npm run preview

# توليد الأيقونات (إذا لزم الأمر)
node generate-icons.js
```

## 📦 Dependencies المضافة

```json
{
  "devDependencies": {
    "vite-plugin-pwa": "latest",
    "sharp": "latest"  // لتوليد الأيقونات
  }
}
```

## 🔐 نقاط الأمان

✅ **معلومات حساسة:**
- لا توجد مفاتيح API في الملفات المرتبطة بـ Git
- استخدم `.env` و `.env.local` فقط للمفاتيح الحقيقية
- `.env` مدرجة في `.gitignore`

✅ **HTTPS المطلوب:**
- Cloudflare Pages يفرض HTTPS تلقائياً
- Service Worker يعمل فقط على HTTPS

✅ **التحديثات الآمنة:**
- vite-plugin-pwa يستخدم autoUpdate
- لن يوقف التطبيق عند التحديثات

## 🐛 استكشاف الأخطاء

### التطبيق لا يظهر خيار التثبيت:
- تأكد من HTTPS (Cloudflare Pages يوفره)
- تحقق من manifest.json صحيح
- أعد تحميل الصفحة

### Service Worker لا يعمل:
- افتح DevTools (F12)
- انتقل إلى "Application" → "Service Workers"
- تحقق من حالة التسجيل

### الأيقونة لا تظهر:
- تأكد من وجود الملفات في `public/`
- امسح cache المتصفح
- أعد البناء: `npm run build`

## 📚 المراجع

- [Web App Manifest Spec](https://www.w3.org/TR/appmanifest/)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [vite-plugin-pwa](https://vite-plugin-pwa.netlify.app/)
- [PWA Checklist](https://web.dev/pwa-checklist/)

## 📞 الدعم

في حالة وجود مشاكل:
1. تحقق من console log (F12)
2. افتح DevTools → Application tab
3. تحقق من manifest.json valid
4. امسح Service Worker cache وأعد المحاولة

---

تم إنشاؤها بواسطة: Copilot PWA Generator
التاريخ: 2026-08-17
