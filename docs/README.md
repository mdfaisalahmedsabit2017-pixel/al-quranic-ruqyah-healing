# Self Ruqyah — লঞ্চ চেকলিস্ট

কোডের কাজ শেষ। বাকি সব কনসোলের কাজ, এবং সেগুলোর একটা ক্রম আছে — কয়েকটা
আগেরটা শেষ না হলে করাই যায় না।

```
JDK 21 ─→ keystore ─→ SHA-1 ─┬→ Firebase Android app ─→ google-services.json ─┐
                             │                                                │
                             └→ GitHub secrets ───────────────────────────────┴→ signed AAB
                                                                                    │
টেস্টার জোগাড় (আজ থেকে) ────────────────────────────────────────────────────────────┤
স্ক্রিনশট (ফোনে) ───────────────────────────────────────────────────────────────────┤
Firestore rules + Vercel env (যেকোনো সময়) ───────────────────────────────────────────┤
                                                                                    ↓
                                                            internal → closed (১৪ দিন) → production
```

## যা এখনই করা যায় — কিছুর জন্য অপেক্ষা লাগে না

| | কাজ | কোথায় | কেন এখনই |
|---|---|---|---|
| ☐ | **১২–১৬ জন টেস্টার জোগাড়** | — | **ঘড়ি ধরে সবচেয়ে দেরি করায়।** নিচে §কেন দেখুন |
| ☐ | Firestore rules-এ `announcements` | Firebase Console | [notifications.md](notifications.md) |
| ☐ | `FIREBASE_SERVICE_ACCOUNT` | Vercel Settings | [notifications.md](notifications.md) |
| ☐ | App content ফরমগুলো ভরা | Play Console | [play-listing.md](play-listing.md) — উত্তর হুবহু লেখা আছে |
| ☐ | Store listing লেখা ও গ্রাফিক আপলোড | Play Console | [play-listing.md §৩](play-listing.md) |
| ☐ | রিভিউয়ারের টেস্ট অ্যাকাউন্ট | — | [play-listing.md §৪](play-listing.md) |

## যা ক্রম মেনে করতে হবে

| | কাজ | ডক |
|---|---|---|
| ☐ | JDK 21 ইনস্টল → keystore তৈরি → **দুই জায়গায় ব্যাকআপ** | [release.md §১](release.md) |
| ☐ | ৪টি GitHub signing secret | [release.md §২](release.md) |
| ☐ | keystore-এর SHA-1/SHA-256 → Firebase-এ Android অ্যাপ `com.selfruqyah.app` | [firebase-android.md](firebase-android.md) |
| ☐ | `google-services.json` → `GOOGLE_SERVICES_JSON` secret | [firebase-android.md §৪](firebase-android.md) |
| ☐ | ট্যাগ push → signed AAB | [release.md §৩](release.md) |
| ☐ | **আপলোডের পর:** Play App Signing-এর SHA যোগ করে `google-services.json` আবার নামানো | [firebase-android.md §৬](firebase-android.md) |

> ⚠️ শেষ লাইনটা বাদ পড়াই Google Sign-In ভাঙার সবচেয়ে সাধারণ কারণ — "আমার
> ফোনে চলছিল, Play থেকে নামানোর পর চলছে না"। Play অ্যাপটিকে **নিজের আলাদা কী
> দিয়ে আবার সাইন করে**, তাই SHA-1 বদলে যায়।

> ⚠️ keystore হারালে **অ্যাপটি আর কোনোদিন আপডেট করা যাবে না**। প্রথম আপলোডেই
> Play App Signing-এ enroll করুন — তাহলে আসল কী Google-এর কাছে থাকে।

## ফোন লাগবে

| | কাজ |
|---|---|
| ☐ | ৬টি স্ক্রিনশট (≥১০৮০×১৯২০): হোম · অডিও · ফুল প্লেয়ার · গাইড রিডার · আমল ট্যাব · ৭ দিনের প্রোগ্রাম |
| ☐ | ডিভাইস চেকলিস্ট চালানো — [release.md §৫](release.md) |

আইকন, splash ও feature graphic তৈরি আছে (`npm run brand`)।

---

## কেন ১২ জন টেস্টার আর ১৪ দিন

Play Console অ্যাকাউন্টটি **personal/individual** (mdfaisalahmedsabit2017@gmail.com)।
২০২৩ সালের নভেম্বরের পর খোলা ব্যক্তিগত অ্যাকাউন্টের জন্য Google শর্ত দেয়:

> প্রোডাকশনে যাওয়ার আবেদনের আগে **কমপক্ষে ১২ জন টেস্টার একটানা ১৪ দিন**
> ক্লোজড টেস্টে opted-in থাকতে হবে।

এড়ানোর একটাই পথ — **organization অ্যাকাউন্ট**, যার জন্য নিবন্ধিত ব্যবসা ও একটা
D-U-N-S নম্বর লাগে। ওটা জোগাড় করতেও কয়েক সপ্তাহ যায়, তাই ব্যবসা প্রতিষ্ঠান
না থাকলে টেস্টারের পথই দ্রুত।

যেখানে মানুষ আটকায়:

- **শুধু ইমেইল যোগ করলে হয় না।** প্রত্যেককে opt-in লিংকে ঢুকে টেস্টে যোগ দিতে
  হবে। যে যোগ দেয়নি, সে গোনায় নেই।
- সংখ্যা মাঝপথে ১২-র নিচে নামলে **ঘড়ি রিসেট**।
- ঘড়ি চালু হয় **প্রথম ক্লোজড-টেস্ট রিলিজ** থেকে, অ্যাকাউন্ট খোলার দিন থেকে নয়।
- তাই ১২ নয়, **১৫–১৬ জন** ধরে রাখুন।

ওই ১৪ দিনে অ্যাপ থেমে থাকে না — যত খুশি আপডেট পাঠানো যায়, আর টেস্টারদের
মতামত নিয়ে ঠিকঠাক করার সেরা সময়ও ওটাই।

---

## ডকের সূচি

| ফাইল | কখন লাগবে |
|---|---|
| [release.md](release.md) | keystore, GitHub secrets, AAB বানানো, ডিভাইস চেকলিস্ট |
| [firebase-android.md](firebase-android.md) | Google সাইন-ইন, SHA fingerprint, `google-services.json` |
| [play-listing.md](play-listing.md) | App content ও Data safety-র হুবহু উত্তর, store listing কপি |
| [notifications.md](notifications.md) | নোটিশ/অফার পাঠানো — Firestore rules ও পুশ সেটআপ |
| [facebook-login.md](facebook-login.md) | Facebook লগইন (v1.0-এ বন্ধ, চালু করার ধাপ) |
| [seo-keywords.md](seo-keywords.md) | ওয়েবসাইটের কীওয়ার্ড গবেষণা |

## v1.0-এ যা ইচ্ছাকৃতভাবে বন্ধ

| ফিচার | কেন | চালু করতে |
|---|---|---|
| মোবাইল OTP লগইন | Blaze প্ল্যান ও প্রতি SMS-এ খরচ | `PHONE_LOGIN_ENABLED = true` + [firebase-android.md §৩ক](firebase-android.md) |
| Facebook লগইন | Facebook অ্যাপ তৈরি করা লাগে | `FACEBOOK_ENABLED = true` + [facebook-login.md](facebook-login.md) |
| অ্যাপে কেনাকাটা | Play Billing ছাড়া ডিজিটাল পণ্য বিক্রি নিষিদ্ধ | চালু করার পরিকল্পনা নেই — কেনাকাটা ওয়েবসাইটে |
