# Android-এ Google Sign-In চালু করা

ফোনে Google বাটনে চাপলে যে বার্তাটা এসেছিল — *"এই অ্যাপে আপাতত Google দিয়ে সাইন-ইন
করা যাচ্ছে না"* — সেটা অ্যাপের নিজের লেখা বার্তা, কোনো ক্র্যাশ নয়। কারণ নেটিভ
সাইন-ইন প্লাগইনটা ছিল না।

**কোডের দিকটা এখন শেষ।** `@capacitor-firebase/authentication@7.5.0` ইনস্টল ও রেজিস্টার
করা হয়েছে। বাকিটা Firebase কনসোলের কাজ, এবং সেটা আপনাকেই করতে হবে।

---

## কেন এটা keystore-এর পরে

Google Sign-In অ্যাপের **সাইনিং সার্টিফিকেটের SHA-1** মিলিয়ে দেখে। তাই ক্রম বাধ্যতামূলক:

```
JDK 21  →  keystore  →  SHA-1  →  Firebase-এ Android app  →  google-services.json
        →  GitHub secret  →  CI build  →  ফোনে Google লগইন কাজ করে
```

keystore বানানোর ধাপ `docs/release.md` §১-এ।

> **এর মধ্যে একটা জিনিস আজই পরীক্ষা করতে পারেন:** বর্তমান APK-তে **ইমেইল ও পাসওয়ার্ড**
> দিয়ে লগইন হওয়ার কথা। ওটা কাজ করছে কিনা দেখুন — কাজ করলে বোঝা যাবে Firebase
> WebView থেকে ঠিকঠাক পৌঁছাচ্ছে, সমস্যাটা কেবল Google প্রোভাইডারেই। (API key-তে
> referrer restriction নেই, সেটা যাচাই করা হয়ে গেছে।)

---

## ধাপ ১ — keystore-এর SHA-1 বের করা

```powershell
keytool -list -v -keystore A:\keys\ruqyah-upload.keystore -alias ruqyah-upload
```

আউটপুটে `Certificate fingerprints` অংশে `SHA1:` ও `SHA256:` লাইন দুটো কপি করুন।

## ধাপ ২ — Firebase-এ Android অ্যাপ যোগ

Firebase Console → প্রজেক্ট **al-quranic-ruqyah** → ⚙️ Project settings →
General → **Add app** → Android:

| ফিল্ড | মান |
|---|---|
| Android package name | `com.selfruqyah.app` |
| App nickname | `Self Ruqyah` |
| Debug signing certificate SHA-1 | ধাপ ১-এর SHA1 |

যোগ করার পর **SHA-256**-টাও আলাদা করে যোগ করুন (একই স্ক্রিনে *Add fingerprint*)।

## ধাপ ৩ — Google প্রোভাইডার চালু করা

Firebase Console → **Authentication → Sign-in method → Google → Enable**।
Project support email হিসেবে নিজের ইমেইল দিন। **Save**।

## ধাপ ৩ক — মোবাইল নম্বর (OTP) — v1.0-এ বন্ধ

> **v1.0-এ ফোন লগইন বন্ধ।** কোড বসানো ও টেস্ট করা আছে, কিন্তু
> `firebase-config.js`-এ `window.PHONE_LOGIN_ENABLED = false` — তাই লগইন
> পর্দায় শুধু Google ও ইমেইল দেখা যায়। খরচ শুরু করার সিদ্ধান্ত নিলে নিচের
> ধাপগুলো করে ওই লাইনটা `true` করবেন — সেটাই শেষ ধাপ, প্রথম নয়।

**Authentication → Sign-in method → Phone → Enable**।

অ্যাপে ফোন লগইনের কোড বসানো আছে ও চালু আছে, কিন্তু provider চালু না করলে
Firebase `operation-not-allowed` ফেরত দেয় — সেটা পেলে অ্যাপ নিজেই ফোন বক্সটা
লুকিয়ে ফেলে, যাতে প্রতিবার ব্যর্থ হওয়া একটা বাটন সামনে না থাকে। চালু করার পর
অ্যাপের ডেটা মুছলে (বা `localStorage.removeItem('phoneAuthUnavailable')`) ফিরে আসে।

### খরচ ও শর্ত

| | |
|---|---|
| **প্ল্যান** | SMS পাঠাতে **Blaze (pay-as-you-go)** লাগে। Spark প্ল্যানে ফোন লগইন কাজ করে না। |
| **দাম** | বাংলাদেশে প্রতি SMS আনুমানিক $0.01–0.05। মাসে ১০০০ সাইনআপ ≈ $১০–৫০। |
| **সীমা** | Firebase Console → Authentication → Settings-এ দৈনিক SMS সীমা বেঁধে দিন। এটা না করলে একটা অপব্যবহারের রাত বড় বিল বানাতে পারে। |
| **টেস্ট নম্বর** | Sign-in method → Phone → *Phone numbers for testing*-এ নম্বর ও কোড বসিয়ে রাখুন — টেস্ট করতে গিয়ে প্রতিবার আসল SMS-এর টাকা যাবে না। ক্লোজড টেস্টের ১৪ দিনে কাজে লাগবে। |

**Android-এ reCAPTCHA লাগে না** — Play Integrity দিয়ে যাচাই হয়, তাই SHA-1/SHA-256
ঠিকমতো নিবন্ধিত থাকা লাগবেই (ধাপ ২)। **ওয়েবে** একটা অদৃশ্য reCAPTCHA দেখায়,
তার জন্য Authentication → Settings → **Authorized domains**-এ সাইটের ডোমেইন
থাকতে হবে।

## ধাপ ৪ — google-services.json

ধাপ ২-এর শেষে ফাইলটা ডাউনলোড হবে (বা Project settings → Your apps → Download)।

- লোকালি রাখুন: `android/app/google-services.json` — এটা **gitignored**, কমিট হবে না
- CI-র জন্য secret বানান:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("A:\Ruqyah Audio App\android\app\google-services.json")) | Set-Clipboard
```

GitHub → Settings → Secrets and variables → Actions → নতুন secret
**`GOOGLE_SERVICES_JSON`** — ক্লিপবোর্ডের লেখাটা পেস্ট করুন।

## ধাপ ৫ — নতুন APK

`ANDROID_KEYSTORE_BASE64` সহ চারটা সাইনিং secret দেওয়া থাকলে (docs/release.md §২)
**Build Android APK** ওয়ার্কফ্লো এখন টেস্ট APK-ও **আপলোড কী দিয়ে সাইন করে**।
এটা ইচ্ছাকৃত: CI প্রতি বিল্ডে নিজের একটা এলোমেলো debug keystore বানায়, ফলে SHA-1
প্রতিবার বদলে যেত আর Google Sign-In প্রতিবারই `DEVELOPER_ERROR` দিত।
এক keystore = এক স্থায়ী SHA-1 = একবার রেজিস্টার করলেই হলো।

Actions → Build Android APK → Run workflow → artifact নামিয়ে ফোনে ইনস্টল করুন।

---

## ধাপ ৬ — Play-তে আপলোডের পর (একবার, ভুলবেন না)

Play App Signing অ্যাপটাকে **আলাদা একটা কী দিয়ে আবার সাইন করে**। তাই Play থেকে
নামানো বিল্ডের SHA-1 আপনার আপলোড কী-র SHA-1 নয়, এবং ওই বিল্ডে Google লগইন
কাজ করবে না — যতক্ষণ না দ্বিতীয় fingerprint-টা যোগ করছেন।

1. Play Console → Release → Setup → **App signing**
2. *App signing key certificate*-এর SHA-1 ও SHA-256 কপি করুন
3. Firebase → Project settings → Your apps → Android → **Add fingerprint** — দুটোই যোগ করুন
4. `google-services.json` **আবার ডাউনলোড** করুন এবং `GOOGLE_SERVICES_JSON`
   secret-টা হালনাগাদ করুন

এই ধাপটা বাদ পড়া Google Sign-In ভাঙার সবচেয়ে সাধারণ কারণ — "আমার ফোনে চলছিল,
Play থেকে নামানোর পর চলছে না"।

---

## কীভাবে কাজ করে (রেফারেন্স)

- `capacitor.config.json`-এ **`skipNativeAuth: true`**। প্লাগইনটা নেটিভ Google
  ফ্লো চালিয়ে শুধু credential ফেরত দেয়, নিজে কাউকে লগইন করায় না। এরপর `app.js`
  সেটা দিয়ে JS SDK-তে `signInWithCredential` করে। পুরো অ্যাপ — প্রোফাইল, কেনা
  বই, Firestore sync — JS SDK-র সেশনই পড়ে, তাই দুটো আলাদা সেশন বানানোর কোনো
  মানে নেই।
- `android/variables.gradle`-এ **`rgcfaIncludeGoogle = true`**। প্লাগইনের ডিফল্ট
  `false`, তাতে Google Sign-In লাইব্রেরিগুলো `compileOnly` হয় — বিল্ড হয় ঠিকঠাক,
  আর ফোনে গিয়ে `NoClassDefFoundError`। এটা এই প্লাগইনের সবচেয়ে পরিচিত ফাঁদ।
- SHA-1 না মিললে Play Services খালি `10` / `DEVELOPER_ERROR` দেয়, যা দেখে কিছুই
  বোঝা যায় না। `app.js` সেটা ধরে বাংলায় বলে দেয় SHA-1 মেলেনি, আর ব্যবহারকারীকে
  ইমেইল-পাসওয়ার্ডে পাঠায়।
