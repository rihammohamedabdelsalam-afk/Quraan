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

مُنفّذة بالكامل: ربط أخ واحد من صفحة الطالب يُنشئ العلاقة العكسية تلقائيًا
(`fn_sibling_mirror` trigger في `0002_scheduling_notifications_siblings.sql`).

---

## Update — Modification pass (see supabase/migrations/0002_*.sql)

هذا القسم يوثّق التعديلات اللي اتضافت فوق النسخة الأولى، طبقًا لطلب التعديل.

### 1. Files changed
- `supabase/migrations/0002_scheduling_notifications_siblings.sql` (جديد)
- `supabase/tests/business_logic.sql` (جديد — سكريبت تحقق يدوي)
- `src/lib/cycleLogic.ts`, `src/lib/availability.ts` (جديد — منطق نقي لأغراض الاختبار والمعاينة)
- `src/lib/__tests__/cycleLogic.test.ts`, `src/lib/__tests__/availability.test.ts` (جديد)
- `src/lib/types.ts` — أنواع جديدة (Notification, SiblingRelationship, TeacherAvailabilitySlot, BlockedTime)
- `src/lib/dates.ts` — `estimateCompletionDate` بقى ياخد الحصص الفعلية المجدولة في الاعتبار أولًا
- `src/pages/StudentProfile.tsx` — تدفق إعادة جدولة حقيقي + محرر الإخوة
- `src/pages/Calendar.tsx` (جديد), `src/pages/Notifications.tsx` (جديد)
- `src/pages/Dashboard.tsx` — فصل مالي/تشغيلي + فرص تحصيل قادمة + قائمة حصص مستحقة
- `src/App.tsx`, `src/components/Layout.tsx` — مسارات وروابط جديدة
- `src/vite-env.d.ts` (جديد — كان ناقص، بيسبب فشل `tsc` في خطوة الـbuild)
- `package.json`, `vitest.config.ts` — إضافة vitest

### 2. Database changes
- Unique index `uq_collections_cycle` — يمنع فعليًا على مستوى الداتابيز أكتر من تحصيل واحد لكل دورة (دفاع إضافي فوق منطق الـtrigger الموجود أصلًا).
- Unique index `uq_outstanding_open_cycle` — رصيد مستحق مفتوح واحد فقط لكل دورة.
- `fn_postpone_lesson`, `fn_reschedule_lesson`, `fn_get_available_slots` — تأجيل/إعادة جدولة حقيقية بحساب فعلي للمواعيد المتاحة (مواعيد عمل المعلمة − الأوقات المحجوبة − الحصص الموجودة).
- `notifications` — أعمدة `cycle_id`, `collection_id` + unique indexes لمنع التكرار.
- `fn_handle_lesson_completed` (نفس منطق الدورة/التحصيل بالضبط) — بقى كمان بينشئ إشعارات عند: الوصول لنقطة التحصيل، اكتمال الدورة، تصفير الرصيد المستحق.
- `fn_generate_lesson_reminders` — إشعارات "قبل 10 دقايق" و"حان الموعد"، idempotent، مُصممة للاستدعاء الدوري (الواجهة بتستدعيها كل دقيقة، أو تقدر تحطيها على pg_cron/Edge Function).
- `fn_sibling_mirror` trigger — العلاقة بين الإخوة بقت bidirectional تلقائيًا من إدخال واحد.

### 3. Business logic changes
لا تغيير في القاعدة الذهبية نفسها (كانت صح من الأول في `0001_init.sql`) — كل التعديل إضافات حوالها:
- تأكيد "مرة واحدة بالضبط لكل دورة" بقى مضمون على مستوى الداتابيز (unique index) مش بس منطق التريجر.
- تاريخ إكمال الدورة المتوقع بقى يعتمد على الحصص المجدولة فعليًا (مش بس النمط الأسبوعي)، فلو اتأجلت آخر حصة، التاريخ المتوقع بيتغيّر تلقائيًا.

### 4. Notification changes
موصوفة في القسم 2 أعلاه — التوليد الفعلي موجود دلوقتي، مش بس الجدول.

### 5. Scheduling/rescheduling changes
تدفق حقيقي: تأجيل → اختيار تاريخ → مواعيد متاحة محسوبة فعليًا من `fn_get_available_slots` → اختيار موعد → `fn_reschedule_lesson` (بيحتفظ بالتاريخ الأصلي، وما بيكررش الحصة). صفحة **التقويم** الجديدة بتعرض الحصص بـ Day/Week/Month وبتسمح بنفس الإجراءات.

### 6. Tests added
- `src/lib/__tests__/cycleLogic.test.ts` — 15+ اختبار يغطي كل الحالات المطلوبة في القسم 24 (تحصيل عند 4/8، مرة واحدة بس، بقاء العداد بعد الشهر، إغلاق الدورة عند 8/8، دورة جديدة تبدأ من 1/8، التأجيل ما بيغيرش التقدم، إلخ).
- `src/lib/__tests__/availability.test.ts` — حساب المواعيد المتاحة بيستبعد التعارضات والأوقات المحجوبة، وما بيخترعش موعد وهمي.
- `supabase/tests/business_logic.sql` — نفس السيناريوهات لكن ضد الـtrigger الحقيقي في الداتابيز (`fn_handle_lesson_completed`)، بما فيها التأكد إن الـunique index بيرفض فعليًا تحصيل مكرر، وإن علاقة الإخوة بتتعمل تلقائيًا في الاتجاهين.

### 7. Tests passed
تقدر تشغّلي `npm test` (بعد `npm install`) للاختبارات في `src/lib/__tests__/`.

**ملاحظة مهمة من بيئة التنفيذ:** الـsandbox اللي اتعمل فيه التعديل مالوش اتصال إنترنت، فمقدرش أعمل `npm install` ولا أشغّل `npm test` / `npm run build` / Supabase فعليًا هنا. اللي اتعمل بدل كده:
- كل ملفات TypeScript اتفحصت بالـTypeScript compiler (نسخة عامة متاحة محليًا) ضد الكود نفسه، من غير أخطاء حقيقية غير الأخطاء المتوقعة بسبب عدم وجود `node_modules` (زي عدم إيجاد `react`/`@supabase`).
- منطق الدورة/التحصيل والمواعيد المتاحة (كل الملفات في `src/lib/`) اتشغّل فعليًا (مش بس اتقرا) بسكريبت تحقق مستقل عن طريق `tsx`، وعدّى الـ14 اختبار بنجاح 100%. ده نفس المنطق بالظبط اللي بيستورد منه `cycleLogic.test.ts`.
- سكريبت `supabase/tests/business_logic.sql` اتكتب بنفس السيناريوهات لكن محتاج Postgres حقيقي (Supabase project) يتشغل عليه — متوفرش هنا.

**لازم تشغّلي `npm install && npm test` و `supabase db push` ثم `psql -f supabase/tests/business_logic.sql` بنفسك قبل الديبلوي للتأكد الكامل.**

### 8. Remaining limitations
- إشعارات "قبل 10 دقايق"/"حان الموعد" محتاجة استدعاء دوري فعلي — الواجهة بتعمل كده وهي مفتوحة (polling كل دقيقة)، لكن لو مفيش حد فاتح التطبيق مفيش cron حقيقي شغال في الخلفية. لو عايزة إشعارات حقيقية حتى لو التطبيق مقفول، محتاجة تضيفي `pg_cron` schedule يستدعي `fn_generate_lesson_reminders()` كل دقيقة، أو Supabase Edge Function مجدولة.
- صفحة التقويم فيها Day/Week/Month views وإجراءات على كل حصة، لكن من غير drag-and-drop.
- كل التعديلات دي اتفحصت منطقيًا وباختبارات مستقلة، لكن محتاجة تشغيل `npm install` + `supabase db push` فعلي وتجربة حقيقية على مشروعك قبل الاعتماد عليها في الإنتاج — زي ما اتوضح في القسم 7.
