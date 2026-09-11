# Self Ruqyah — লঞ্চ চেকলিস্ট

কোডের কাজ শেষ। বাকি সব কনসোলের কাজ, এবং সেগুলোর একটা ক্রম আছে — কয়েকটা
আগেরটা শেষ না হলে করাই যায় না।

## অবস্থা — ২০২৬-০৯-০১

**যন্ত্রপাতির চেইনটা এখন খোলা।** যা করা হয়ে গেছে:

- ✅ **JDK 21** ইনস্টল (Temurin 21.0.12, `JAVA_HOME` মেশিন-লেভেলে সেট)
- ✅ **keystore তৈরি** — `A:\keys\ruqyah-upload.keystore`, alias `ruqyah-upload`,
  RSA 4096, মেয়াদ ২০৫৪ পর্যন্ত। পাসওয়ার্ড `A:\keys\CREDENTIALS.txt`-এ
  (**রিপোর বাইরে**), কপি `C:\Users\faisa\keys-backup\`-এ।
  ⚠️ এখনো **ক্লাউড ড্রাইভ ও পেনড্রাইভে** রাখা বাকি।
- ✅ `android/keystore.properties` ও `android/local.properties` লেখা (দুটোই gitignored)
- ✅ **প্রথম signed AAB বিল্ড হয়েছে লোকালি** —
  `android/app/build/outputs/bundle/release/app-release.aab` (৬.৩৬ MB,
  `META-INF/RUQYAH-U.RSA` = আপলোড কী দিয়েই সাইন করা)
- ✅ Firebase-এ **Android অ্যাপ যোগ** — `com.selfruqyah.app`,
  App ID `1:500893735095:android:1729dbb7c543d5f04a9532`,
  SHA-1 ও SHA-256 **দুটোই** রেজিস্টার করা
- ✅ Firebase Authentication-এ Email/Password · Phone · Google — তিনটাই Enabled
- ✅ `npm run build:native` · `audit:native` · `check:android` · `smoke` — সব পাস

**২০২৬-০৯-০২-এ যা যোগ হলো:**

- ✅ **`google-services.json` বসানো** — `android/app/` (gitignored)। ব্রাউজার-ডাউনলোড
  কাজ করেনি (নিচে দেখুন), তাই আনা হয়েছে
  `firebase-tools apps:sdkconfig ANDROID <appId>` দিয়ে। ফাইলে
  `client_type: 1` (ANDROID) OAuth client আছে যার sha1 =
  `c56d0cac0e305e48bcba94418139d31920934793` — keystore-এর SHA-1-এর সাথে মিলেছে।
- ✅ **AAB আবার বিল্ড** — এবার `default_web_client_id` সহ (google-services প্লাগইন
  চলেছে), তাই ফোনে Google লগইন কাজ করবে। ৬.৬৭ MB, সাইনড
  (`META-INF/RUQYAH-U.RSA`; `resources.pb`-তে `default_web_client_id`,
  `google_api_key`, `gcm_defaultSenderId` — যাচাই করা)।
- ✅ **Firestore rules ডিপ্লয়** — `npm run deploy:rules`।
- ✅ Firebase Cloud Messaging API (V1) — **Enabled** (যাচাই করা)।

> ### ⚠️ রুলস ডিপ্লয় করতে গিয়ে যা ধরা পড়ল
>
> **`firestore.rules` লেখা হয়েছিল ২০২৬-০৮-০৯-এ, কিন্তু কোনোদিন ডিপ্লয় হয়নি।**
> ডিপ্লয়ের আগে লাইভে চলছিল **৫ জুলাই ২০২৬-এর ১৭ লাইনের পুরনো সংস্করণ** —
> শুধু `users`, `patients`, `purchases`। ফলে সেই দিন পর্যন্ত প্রোডাকশনে:
>
> - **`reviews` ম্যাচই ছিল না** → প্রতিটি রিভিউ পড়া/লেখা "Missing or insufficient
>   permissions"। অর্থাৎ রিভিউ ফিচারটা এতদিন **পুরো মরা** ছিল — ঠিক যে
>   ব্যর্থতাটা ফাইলের মাথার কমেন্টে সাবধান করা আছে।
> - **`announcements` ম্যাচ ছিল না** → নোটিশ প্রকাশ করাই যেত না।
> - **`users`-এ ছিল `allow read, write: if request.auth.uid == userId`** — কোনো
>   ফিল্ড-বাধা ছাড়া। মানে **লগইন করা যেকেউ ব্রাউজার কনসোল থেকে নিজের
>   `memberships['live-class'].until` লিখে ৳৪৯০-র লাইভ ক্লাস নিজেকে দিয়ে দিতে
>   পারতেন**, আর `/api/membership` তখন টেলিগ্রাম লিংক তিনটে দিয়ে দিত।
>
> তিনটাই এখন বন্ধ। **পুরনো রুলসেট Firebase Console-এর version history-তে আছে**
> (ডিপ্লয়ের আগের সক্রিয়টা "Jul 5, 2026 • 2:10 am"), দরকার হলে রোলব্যাক করা যায়।
> শিক্ষাটা ফাইলের কমেন্টেই লেখা: **এই ফাইল এডিট করা আর লাইভ করা এক জিনিস নয়।**

> ### ⚠️ কোন Google অ্যাকাউন্টে আপলোড হবে — আগে নিশ্চিত হোন
>
> **দুটো অ্যাকাউন্ট জড়িয়ে আছে, আর ভুলটা অপরিবর্তনীয়।** প্যাকেজ নাম
> `com.selfruqyah.app` একবার যে ডেভেলপার অ্যাকাউন্টে তৈরি হবে, সেটা **চিরকালের
> জন্য** ওই অ্যাকাউন্টের — অন্য অ্যাকাউন্টে ওই নামে আর কখনো অ্যাপ বানানো যাবে না,
> মোছাও যাবে না।
>
> - **`mdfaisalahmedsabit2017@gmail.com`** — Google Drive এই অ্যাকাউন্টের, আর
>   রাকী বলছেন ডেভেলপার ভেরিফিকেশন অনেক আগেই সম্পন্ন। **সম্ভবত এখানেই আসল
>   ডেভেলপার অ্যাকাউন্ট।**
> - **`crackdmcbuet@gmail.com`** — এখানে *Al Quranic Ruqyah Healing*
>   (ID `8960809354084306727`, personal) নামে একটা অ্যাকাউন্ট দেখা গেছে
>   ২০২৬-০৯-০১-এ, কিন্তু ওটা **ভেরিফায়েড নয়** — *Create app* বোতাম নিষ্ক্রিয়,
>   ফোন ভেরিফিকেশন বাকি। এটাই সম্ভবত ভুল/অব্যবহৃত অ্যাকাউন্ট।
>
> Firebase প্রজেক্ট `crackdmcbuet`-এর, GitHub `mdfaisalahmedsabit2017-pixel` —
> অ্যাকাউন্টগুলো মিশে আছে। **আপলোডের আগে Play Console-এ অ্যাকাউন্ট সুইচার খুলে
> দেখে নিন কোনটায় ভেরিফিকেশন সবুজ**, আর অ্যাপটা ওখানেই তৈরি করুন।


**যা এখনো বাকি — সবগুলোই কেবল আপনি করতে পারেন:**

1. **কোন Google অ্যাকাউন্টে অ্যাপটা তৈরি হবে, সেটা নিশ্চিত করা** (উপরের বাক্স)।
   `crackdmcbuet@gmail.com`-এর নিচেরটা ২০২৬-০৯-০১-এ অভেরিফায়েড ছিল, কিন্তু
   রাকীর ভেরিফায়েড অ্যাকাউন্ট আছে — সম্ভবত `mdfaisalahmedsabit2017@gmail.com`-এ।
   **ভুল অ্যাকাউন্টে তৈরি করলে প্যাকেজ নামটা চিরতরে ওখানে আটকে যাবে।**
2. ✅ **keystore-এর অফ-মেশিন ব্যাকআপ** — ২০২৬-০৯-০২-এ Google Drive-এ তোলা হয়েছে,
   ফোল্ডার **"Self Ruqyah — Android keystore backup"**
   (`mdfaisalahmedsabit2017@gmail.com`-এর Drive, ফাইল `ruqyah-upload.keystore`,
   ৪৫০২ বাইট — লোকাল ফাইলের সাথে মিলেছে)।
   ⚠️ **পাসওয়ার্ডটা ইচ্ছাকৃতভাবে Drive-এ তোলা হয়নি** — কী আর তার পাসওয়ার্ড এক
   জায়গায় রাখলে ব্যাকআপের নিরাপত্তা ভেঙে যায়। ওটা আছে `A:\keys\CREDENTIALS.txt`-এ,
   **একটামাত্র মেশিনে**। পাসওয়ার্ড ম্যানেজারে তুলুন — নইলে মেশিন গেলে Drive-এর
   কী-টাও অকেজো।
3. **`FIREBASE_SERVICE_ACCOUNT`** → Vercel env (পুশ নোটিফিকেশনের জন্য;
   [notifications.md](notifications.md) ধাপ ২)। এটা প্রজেক্টের **মাস্টার চাবি**,
   তাই ইচ্ছাকৃতভাবে আপনার হাতেই রাখা হলো।
4. **১২–১৬ জন টেস্টার জোগাড়** — ঘড়ি ধরে এটাই সবচেয়ে দেরি করায়।

> **এই মেশিনের একটা আলাদা বাগ:** Chrome-এর ডাউনলোড ফোল্ডার `D:\downloads`-এ সেট,
> কিন্তু **D: ড্রাইভ নেই** (আছে A, C, F, G)। তাই ব্রাউজার থেকে কোনো ডাউনলোডই হয়
> না — কোনো এররও দেখায় না। কনসোল থেকে ফাইল আনতে হলে CLI ব্যবহার করুন।

---

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
| ✅ | Firestore rules-এ `announcements` — **ডিপ্লয় হয়েছে ২০২৬-০৯-০২** | Firebase Console | [notifications.md](notifications.md) |
| ☐ | `FIREBASE_SERVICE_ACCOUNT` | Vercel Settings | [notifications.md](notifications.md) |
| ☐ | App content ফরমগুলো ভরা | Play Console | [play-listing.md](play-listing.md) — উত্তর হুবহু লেখা আছে |
| ☐ | Store listing লেখা ও গ্রাফিক আপলোড | Play Console | [play-listing.md §৩](play-listing.md) |
| ☐ | রিভিউয়ারের টেস্ট অ্যাকাউন্ট | — | [play-listing.md §৪](play-listing.md) |

## যা ক্রম মেনে করতে হবে

| | কাজ | ডক |
|---|---|---|
| ✅ | JDK 21 ইনস্টল → keystore তৈরি → ব্যাকআপ (লোকাল কপি আছে, **অফ-মেশিন ব্যাকআপ বাকি**) | [release.md §১](release.md) |
| ☐ | ৪টি GitHub signing secret (**ঐচ্ছিক** — লোকাল বিল্ড কাজ করছে) | [release.md §২](release.md) |
| ✅ | keystore-এর SHA-1/SHA-256 → Firebase-এ Android অ্যাপ `com.selfruqyah.app` | [firebase-android.md](firebase-android.md) |
| ☐ | `google-services.json` → `GOOGLE_SERVICES_JSON` secret | [firebase-android.md §৪](firebase-android.md) |
| ✅ | signed AAB — ট্যাগ নয়, **লোকালি** `gradlew bundleRelease` দিয়ে | [release.md §৩](release.md) |
| ☐ | **আপলোডের পর:** Play App Signing-এর SHA যোগ করে `google-services.json` আবার নামানো | [firebase-android.md §৬](firebase-android.md) |

> ⚠️ শেষ লাইনটা বাদ পড়াই Google Sign-In ভাঙার সবচেয়ে সাধারণ কারণ — "আমার
> ফোনে চলছিল, Play থেকে নামানোর পর চলছে না"। Play অ্যাপটিকে **নিজের আলাদা কী
> দিয়ে আবার সাইন করে**, তাই SHA-1 বদলে যায়।

> ⚠️ keystore হারালে **অ্যাপটি আর কোনোদিন আপডেট করা যাবে না**। প্রথম আপলোডেই
> Play App Signing-এ enroll করুন — তাহলে আসল কী Google-এর কাছে থাকে।

## ফোন লাগবে

> **Play-র জন্য অপেক্ষা করার দরকার নেই — সাইডলোড করে আজই টেস্ট করা যায়।**
> AAB ফোনে ইনস্টল হয় না, তাই একই কী দিয়ে একটা APK-ও বানানো আছে:
>
> ```powershell
> $env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot'
> cd 'A:\Ruqyah Audio App\android'; .\gradlew.bat assembleRelease --no-daemon
> ```
>
> ফল: `android\app\build\outputs\apk\release\app-release.apk` (৬.৭০ MB)।
> কপি রাখা আছে `C:\Users\faisa\SelfRuqyah-v1.0-release.apk`।
> সার্টিফিকেট যাচাই করা — `keytool -printcert -jarfile <apk>` দেয়
> SHA-1 `C5:6D:...:93`, অর্থাৎ Firebase-এ নিবন্ধিত fingerprint-ই, তাই
> **এই APK-তে Google সাইন-ইন কাজ করার কথা**। না করলে সমস্যা কোডে,
> SHA মিলছে না বলে নয় (`docs/firebase-android.md` দ্রষ্টব্য)।


| | কাজ |
|---|---|
| ✅ | ৬টি স্ক্রিনশট — `assets/screenshots/`-এ তোলা আছে; ছিল (≥১০৮০×১৯২০): হোম · অডিও · ফুল প্লেয়ার · গাইড রিডার · আমল ট্যাব · ৭ দিনের প্রোগ্রাম |
| ☐ | ডিভাইস চেকলিস্ট চালানো — [release.md §৫](release.md) |

আইকন, splash ও feature graphic তৈরি আছে (`npm run brand`)।

---

## কেন ১২ জন টেস্টার আর ১৪ দিন

Play Console অ্যাকাউন্টটি **personal/individual** — *Al Quranic Ruqyah Healing*,
Account ID `8960809354084306727`, লগইন **crackdmcbuet@gmail.com**
(আগে এখানে ভুল করে `mdfaisalahmedsabit2017@gmail.com` লেখা ছিল — ওটা GitHub-এর অ্যাকাউন্ট)।
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
