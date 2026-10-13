/**
 * Clerk's sign-in and sign-up in Arabic: its own Arabic file (arSA) plus the phrases that file
 * leaves empty (they would show in English). Only the screens customers meet are filled in.
 */
import { arSA } from '@clerk/localizations';

const missing = {
  developmentMode: 'وضع التطوير',
  formFieldInputPlaceholder__emailAddress: 'أدخلي بريدك الإلكتروني',
  formFieldInputPlaceholder__emailAddress_username: 'أدخلي البريد الإلكتروني أو اسم المستخدم',
  formFieldInputPlaceholder__password: 'أدخلي كلمة المرور',
  formFieldInputPlaceholder__signUpPassword: 'أنشئي كلمة مرور',
  formFieldInputPlaceholder__phoneNumber: 'أدخلي رقم جوالك',
  formFieldInputPlaceholder__firstName: 'الاسم الأول',
  formFieldInputPlaceholder__lastName: 'اسم العائلة',
  formFieldInputPlaceholder__username: 'أدخلي اسم المستخدم',
  formFieldInputPlaceholder__backupCode: 'أدخلي الرمز الاحتياطي',
  formFieldInput__emailAddress_format: 'مثال على الصيغة: name@example.com',
  footerActionLink__alternativePhoneCodeProvider: 'أرسلي الرمز برسالة نصية بدلًا من ذلك',
  signIn: {
    start: {
      titleCombined: 'المتابعة إلى {{applicationName}}',
      actionLink__join_waitlist: 'انضمّي إلى قائمة الانتظار',
      actionText__join_waitlist: 'تريدين وصولًا مبكرًا؟',
      alternativePhoneCodeProvider: {
        actionLink: 'استخدمي طريقة أخرى',
        label: 'رقم الجوال على {{provider}}',
        subtitle: 'أدخلي رقم جوالك لتصلك رسالة التحقق على {{provider}}.',
        title: 'تسجيل الدخول إلى {{applicationName}} عبر {{provider}}',
      },
    },
    alternativePhoneCodeProvider: {
      formTitle: 'رمز التحقق',
      resendButton: 'لم يصلك الرمز؟ أعيدي الإرسال',
      subtitle: 'للمتابعة إلى {{applicationName}}',
      title: 'تحقّقي من {{provider}}',
    },
    emailLink: { verifiedTransferable: { subtitle: 'عودي إلى النافذة الأصلية للمتابعة', title: 'تم التحقق من البريد الإلكتروني' } },
    passwordCompromised: { title: 'كلمة المرور مكشوفة' },
    passwordUntrusted: { title: 'كلمة المرور غير موثوقة' },
    protectCheck: { loading: 'جارٍ التحميل…', retryButton: 'حاولي مرة أخرى', subtitle: 'يُرجى الانتظار بينما نتحقق من طلبك.', title: 'نتحقق من طلبك' },
  },
  signUp: {
    alternativePhoneCodeProvider: {
      resendButton: 'لم يصلك الرمز؟ أعيدي الإرسال',
      subtitle: 'أدخلي رمز التحقق المرسل إلى {{provider}}',
      title: 'تحقّقي من {{provider}}',
    },
    legalConsent: {
      checkbox: {
        label__onlyPrivacyPolicy: 'أوافق على {{ privacyPolicyLink || link("سياسة الخصوصية") }}',
        label__onlyTermsOfService: 'أوافق على {{ termsOfServiceLink || link("شروط الاستخدام") }}',
        label__termsOfServiceAndPrivacyPolicy:
          'أوافق على {{ termsOfServiceLink || link("شروط الاستخدام") }} و{{ privacyPolicyLink || link("سياسة الخصوصية") }}',
      },
      continue: { subtitle: 'يُرجى قراءة الشروط والموافقة عليها للمتابعة', title: 'الموافقة القانونية' },
    },
    protectCheck: { loading: 'جارٍ التحميل…', retryButton: 'حاولي مرة أخرى', subtitle: 'يُرجى الانتظار بينما نتحقق من طلبك.', title: 'نتحقق من طلبك' },
    restrictedAccess: {
      actionLink: 'تسجيل الدخول',
      actionText: 'لديكِ حساب بالفعل؟',
      blockButton__emailSupport: 'راسلي الدعم',
      blockButton__joinWaitlist: 'انضمّي إلى قائمة الانتظار',
      subtitle: 'التسجيل متوقف حاليًا. إن كنتِ ترين أنه يحق لكِ الدخول، يُرجى التواصل مع الدعم.',
      subtitleWaitlist: 'التسجيل متوقف حاليًا. لتكوني أول من يعلم عند الإطلاق، انضمّي إلى قائمة الانتظار.',
    },
  },
};

type Tree = Record<string, unknown>;
const isTree = (v: unknown): v is Tree => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Fills only what Clerk's Arabic leaves empty; its own translations are kept. */
function fillMissing(base: Tree, extra: Tree): Tree {
  const out: Tree = { ...base };
  for (const [k, v] of Object.entries(extra)) {
    if (isTree(v)) out[k] = fillMissing(isTree(base[k]) ? (base[k] as Tree) : {}, v);
    else if (base[k] === undefined || base[k] === null) out[k] = v;
  }
  return out;
}

export const clerkArabic = fillMissing(arSA as unknown as Tree, missing) as unknown as typeof arSA;
