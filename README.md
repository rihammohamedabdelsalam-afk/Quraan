# نظام إدارة حصص المعلمة — Teacher Lesson & Collection System

تطبيق ويب لمستخدم واحد (المعلمة) لإدارة الطلاب، الحصص، دورات التحصيل،
والمحفظة، طبقًا لـ PRD المرفق. الـstack: **React + Vite + TypeScript +
Tailwind** للواجهة، و**Supabase (Postgres + Auth)** للباك إند.

## أهم نقطة: منطق العمل موجود في قاعدة البيانات نفسها

القاعدة الذهبية في الـPRD:

> المعلمة تحصل على قيمة الدورة كاملة عند إكمال نصف عدد الحصص، لكن دورة
> الحصص لا تنتهي إلا عند إكمال العدد الكامل.

هذا المنطق (نقطة التحصيل، عدم تصفير العداد، الرصيد المستحق، بداية دورة
جديدة تلقائيًا) مكتوب كـ **trigger في Postgres** في
`supabase/migrations/0001_init.sql` (function: `fn_handle_lesson_completed`)
وليس في كود الواجهة. الفايدة: أي تعديل على حالة حصة (من أي مكان: الواجهة،
Supabase Studio، API خارجي) هيلتزم بنفس القاعدة تلقائيًا، والحسابات متوافقة
دايمًا مع قاعدة البيانات.

## خطوات التشغيل

### 1) إنشاء مشروع Supabase

1. اعملي مشروع جديد على [supabase.com](https://supabase.com).
2. من SQL Editor، شغّلي محتوى الملف `supabase/migrations/0001_init.sql`
   كامل مرة واحدة (أو من خلال Supabase CLI: `supabase db push`).
3. من Authentication → Users: أنشئي مستخدم واحد (إيميل + باسورد) وهو
   حساب المعلمة نفسها. لا يوجد Sign Up في الواجهة عن قصد — مستخدم واحد فقط
   حسب الـPRD.
4. من Project Settings → API: انسخي `Project URL` و`anon public key`.

### 2) إعداد المشروع محليًا

```bash
npm install
cp .env.example .env
# افتحي .env وحطي فيها Project URL والـanon key
npm run dev
```

### 3) الرفع على GitHub

```bash
git init
git add .
git commit -m "Initial commit — teacher lesson & collection system"
git branch -M main
git remote add origin https://github.com/USERNAME/REPO.git
git push -u origin main
```

`.env` مستبعد من Git تلقائيًا (`.gitignore`) — متنسيش تضيفي المتغيرين
`VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY` في إعدادات أي منصة نشر
(Vercel / Netlify / Cloudflare Pages...) عند الديبلوي.

## هيكل المشروع

```
supabase/migrations/0001_init.sql   → الجداول + RLS + منطق الدورات (trigger)
src/lib/types.ts                    → أنواع TypeScript مطابقة لجداول الداتابيز
src/lib/supabase.ts                 → عميل Supabase
src/pages/Dashboard.tsx             → الرئيسية: حصص اليوم، تقدم الطلاب، ملخص المحفظة
src/pages/Students.tsx              → قائمة الطلاب + إضافة طالب (ينشئ الدورة الأولى تلقائيًا)
src/pages/StudentProfile.tsx        → تقدم الدورة، جدولة/تسجيل/تأجيل الحصص، سجل التحصيل
src/pages/Wallet.tsx                → إجمالي المحفظة + تفصيل حسب الطالب + فلاتر
src/pages/OutstandingLessons.tsx    → الحصص المستحقة (رصيد خدمي، مش مديونية مالية)
src/pages/Availability.tsx          → أيام وساعات عمل المعلمة + أوقات محجوبة
```

## ما تم تنفيذه من الـMVP (Section 58 في الـPRD)

- تسجيل دخول المعلمة (مستخدم واحد).
- إدارة الطلاب (إضافة، عرض، بحث).
- دورة الحصص (Lesson Cycle) تُنشأ تلقائيًا مع كل طالب.
- منطق التحصيل عند نصف العدد بالضبط، وعدم تصفير العداد إلا عند اكتمال
  العدد الكامل — منفّذ كـtrigger في قاعدة البيانات (Section 50 & 61).
- الرصيد المستحق (Outstanding Lessons) كمفهوم منفصل تمامًا عن المحفظة
  المالية (Section 18، 54، 55).
- بدء دورة جديدة تلقائيًا عند إكمال الدورة (Section 13).
- المحفظة: الإجمالي + تفصيل حسب الطالب + فلاتر (يوم/شهر/سنة).
- جدول الطالب الأسبوعي، ومواعيد عمل المعلمة، والأوقات المحجوبة.
- تسجيل الحصة كمكتملة / تأجيلها (الحصة المؤجلة لا تغيّر التقدم إطلاقًا،
  Section 31).
- سجل الحصص، سجل التحصيل، تاريخ الدورات لكل طالب.
- Row Level Security بحيث كل بيانات محصورة على المعلمة صاحبة الحساب.

## مبسّط عن قصد في هذه النسخة (تحتاج قرار عملي منك قبل التوسّع فيها)

- **حساب "الأيام المتبقية حتى إكمال الدورة" (Section 27-28):** الكود
  الحالي (`src/lib/dates.ts`) بيحسبها بناءً على أيام الجدول الأسبوعي فقط،
  من غير ما يراعي الأوقات المحجوبة أو الحصص المؤجلة بدقة كاملة. المنطق
  الأساسي (التحصيل + الدورة) دقيق 100%، لكن تقدير التاريخ تقريبي.
- **إعادة الجدولة الذكية (Section 32):** الواجهة بتسمح بإضافة/تأجيل حصة،
  لكن اقتراح مواعيد بديلة تلقائيًا حسب Availability + Blocked Time لسه
  مش متنفذ — ده أكبر جزء ناقص لو عايزة تكمليه بعد كده.
- **الإشعارات (Section 36-39):** الجدول `notifications` موجود في
  الداتابيز، لكن الإرسال الفعلي (push/SMS) محتاج خدمة خارجية (زي
  Supabase Edge Functions + مزوّد إشعارات) مش جزء من هذا الـMVP.

## أخوة الطلاب (Sibling Relationships)

الجدول `sibling_relationships` موجود في الداتابيز جاهز، وواجهة ربط
الإخوة ببعض لسه مش مضافة في الشاشات — سهل تضيفيها من نفس نمط الفورمز
الموجودة.
