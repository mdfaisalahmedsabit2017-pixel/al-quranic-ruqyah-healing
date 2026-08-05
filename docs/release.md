# রিলিজ রানবুক — Self Ruqyah (Android)

এই ফাইলটা Phase 4-এর কাজ: **স্বাক্ষরিত (signed) AAB** কীভাবে তৈরি হয়, keystore কোথায় থাকে,
আর Play Console-এ প্রথম আপলোডের আগে কী কী ঠিক থাকতে হবে।

---

## ০. এক নজরে

| জিনিস | কোথায় |
|---|---|
| Debug APK (টেস্টের জন্য) | GitHub Actions → **Build Android APK** → artifact |
| Signed AAB (Play-এর জন্য) | GitHub Actions → **Release AAB** → artifact |
| Keystore ফাইল | **রিপোজিটরির বাইরে** — `A:\keys\ruqyah-upload.keystore` |
| Keystore-এর কপি CI-তে | GitHub repo secret `ANDROID_KEYSTORE_BASE64` |
| versionCode | `android/app/build.gradle`, হাতে বাড়াতে হয় |

> ⚠️ **এই রিপোজিটরি পাবলিক।** keystore, `keystore.properties`, বা `google-services.json`
> কখনো কমিট করা যাবে না। `.gitignore` ও `android/.gitignore` দুটোতেই ব্লক করা আছে, কিন্তু
> `git add -A` চালানোর অভ্যাস করবেন না।

---

## ১. Keystore তৈরি (একবারই, জীবনে একবার)

`keytool` লাগে, যেটা JDK-র সাথে আসে। **এই মেশিনে এখন কোনো JDK নেই** (`JAVA_HOME` খালি)।

### ধাপ ১ক — JDK 21 ইনস্টল

[Temurin JDK 21 (Windows x64 .msi)](https://adoptium.net/temurin/releases/?version=21) নামিয়ে ইনস্টল করুন।
ইনস্টলারে **"Set JAVA_HOME variable"** টিক দিন। (CI-ও Java 21 ব্যবহার করে, কাজেই ভবিষ্যতে
লোকালি বিল্ড করতে চাইলেও এটাই লাগবে।)

ইনস্টলের পর নতুন একটা টার্মিনালে যাচাই:

```powershell
keytool -help
```

### ধাপ ১খ — কী বানানো

```powershell
mkdir A:\keys
keytool -genkeypair -v `
  -keystore A:\keys\ruqyah-upload.keystore `
  -alias ruqyah-upload `
  -keyalg RSA -keysize 4096 -validity 10000 `
  -storetype PKCS12
```

প্রশ্নগুলোর উত্তর:

- **পাসওয়ার্ড** — একটা শক্ত পাসওয়ার্ড দিন এবং পাসওয়ার্ড ম্যানেজারে সেভ করুন।
  `storepass` আর `keypass` একই রাখলে ঝামেলা কম।
- **First and last name** → `Self Ruqyah`
- **Organizational unit / Organization** → আপনার নাম বা প্রতিষ্ঠানের নাম
- **City / State / Country code** → যেমন `Dhaka` / `Dhaka` / `BD`

`-validity 10000` = ~২৭ বছর। Play-এর ন্যূনতম শর্ত ২০৩৩ সালের পরে মেয়াদ শেষ হওয়া।

### ধাপ ১গ — ব্যাকআপ (এটা এড়াবেন না)

ফাইলটা **অন্তত দুই জায়গায়** রাখুন — যেমন একটা এনক্রিপ্টেড ক্লাউড ড্রাইভ আর একটা পেনড্রাইভ।
পাসওয়ার্ডসহ। প্রথম আপলোডে **Play App Signing**-এ এনরোল করলে (§৩) আসল সাইনিং কী Google-এর
কাছে থাকে, আর এই আপলোড কী হারালে Google-কে বলে রিসেট করা যায় — কিন্তু এনরোল না করলে
ফাইল হারানো মানে **অ্যাপটা আর কোনোদিন আপডেট করা যাবে না**।

---

## ২. CI-তে কী দেওয়া (GitHub secrets)

Keystore-কে base64 করুন:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("A:\keys\ruqyah-upload.keystore")) | Set-Clipboard
```

এরপর GitHub → repo → **Settings → Secrets and variables → Actions → New repository secret**।
চারটা সিক্রেট:

| নাম | মান |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | উপরের ক্লিপবোর্ডের লেখাটা |
| `ANDROID_KEYSTORE_PASSWORD` | keystore-এর পাসওয়ার্ড |
| `ANDROID_KEY_ALIAS` | `ruqyah-upload` |
| `ANDROID_KEY_PASSWORD` | key-এর পাসওয়ার্ড (সাধারণত storepass-এর সমান) |

> base64 লেখাটা **কোথাও পেস্ট করে রাখবেন না** — চ্যাটে না, ফাইলে না, কমিটে না।
> ওটাই আসলে প্রাইভেট কী।

### লোকালি বিল্ড করতে চাইলে (ঐচ্ছিক)

`android/keystore.properties` বানান (এই ফাইল gitignored):

```properties
storeFile=A:/keys/ruqyah-upload.keystore
storePassword=...
keyAlias=ruqyah-upload
keyPassword=...
```

`build.gradle` আগে এই ফাইল দেখে, না পেলে এনভায়রনমেন্ট ভেরিয়েবল দেখে। দুটোর কোনোটাই না
থাকলে release বিল্ড **unsigned** হবে এবং Gradle একটা WARNING ছাপবে।

---

## ৩. AAB বানানো

```powershell
git tag v1.0.0
git push origin v1.0.0
```

তাতে `.github/workflows/release-aab.yml` চলবে। অথবা GitHub → Actions → **Release AAB**
→ Run workflow।

ওয়ার্কফ্লো যা যা করে:

1. চারটা সিক্রেট আছে কিনা দেখে — না থাকলে সাথে সাথে ফেল (unsigned AAB বানিয়ে
   Play-তে আপলোড করে ২০ মিনিট পর জানার চেয়ে ভালো)
2. `npm run build:native` — ওয়েব অ্যাসেট, PDF ছাড়া
3. `native/` ২০ MB ছাড়ালে বিল্ড ফেল
4. `npx cap sync android`
5. `./gradlew bundleRelease`
6. AAB-তে সত্যিই সিগনেচার ব্লক আছে কিনা যাচাই
7. **পলিসি অডিট** — `tools/audit-native.js` (নিচে §৩ক)
8. keystore মুছে ফেলে, AAB আর্টিফ্যাক্ট আপলোড করে

Artifact নামিয়ে `app-release.aab` পাবেন।

### ৩ক. পলিসি অডিট — কী আটকায়, কী আটকায় না

লোকালি চালাতে: `npm run audit:native`

Play-এর Payments ও anti-steering নিয়ম ডিজিটাল পণ্যের **বিকল্প ক্রয়পথের দিকে ইঙ্গিত
করাও** নিষেধ করে। কিন্তু নিয়মটা ব্যবহারকারী **যা দেখতে ও ছুঁতে পারে** তা নিয়ে।
তাই স্ক্রিপ্টটা তিনটা জিনিসে **ফেল** করে:

1. শিপ হওয়া মার্কআপে (`index.html`) কোনো দাম, "কিনুন" বাটন বা পেমেন্ট নম্বর —
   এটাই আসল কাজের চেক, কারণ বাস্তবে যেটা ভাঙে সেটা হলো একটা `#web-only`
   মার্কার এডিট করতে গিয়ে মুছে যাওয়া
2. পেমেন্ট নম্বর যেকোনো রূপে (`payments.js`, `PAYMENT_BKASH` — নেটিভ বিল্ডে
   এগুলো কপিই হয় না)
3. ক্রয় ফাংশনগুলো (`openBuyModal`, `submitCoursePurchase`, `selectPayMethod`) —
   `build.js` এগুলো কেটে দেয়; কাটা বন্ধ হয়ে গেলে ধরা পড়ে

যা **ফেল করায় না**, ইচ্ছাকৃতভাবে: `app.js`-এর কমেন্ট, আর
`IS_NATIVE ? ... : ...`-এর যে শাখাটা নেটিভে কখনো চলে না তার ভেতরের স্ট্রিং।
ওগুলো অগম্য। আর **অ্যাডমিন প্যানেল** (আপনার সিদ্ধান্তে অ্যাপে রাখা, ইমেইল গেটের
পেছনে) স্বভাবতই পুরোনো লেনদেন ৳-সহ দেখায়। ওগুলোতে ফেল করানো মানে হয় অ্যাডমিন
প্যানেল বাদ দেওয়া, নয়তো এমন indirection-এর স্তূপ বানানো যাতে পলিসিগত নিরাপত্তা
এক বিন্দুও বাড়ে না। তাই ওগুলো **রিভিউ তালিকা** হিসেবে ছাপা হয়, বিল্ড আটকায় না।

WhatsApp নম্বরটা (`wa.me/8801886608999`) একই ডিজিট হলেও ওটা **অ্যাপয়েন্টমেন্টের
যোগাযোগ** — বাস্তব-জগতের সেবা, Play Billing-এর আওতার বাইরে। তাই `wa.me` / `tel:` /
`ADMIN_WA` প্রসঙ্গে থাকলে অডিট ছাড় দেয়।

> নতুন কোনো দাম বা ক্রয় UI যোগ করলে সেটা `/* #web-only */ … /* /#web-only */`
> (JS) বা `<!-- #web-only --> … <!-- /#web-only -->` (HTML)-এর ভেতরে রাখুন।
> `build.js` কাটার পর আউটপুটটা `new Function()` দিয়ে parse করে দেখে, কাজেই
> মার্কার ভুল জায়গায় বসালে বিল্ড তখনই ফেল করবে — ফোনে নয়।

---

## ৪. Play Console — প্রথম আপলোড

1. **Play App Signing-এ এনরোল করুন** — প্রথম রিলিজ তৈরির সময় Play নিজেই অফার করে।
   *"Use Google-generated key"* বেছে নিন। এতে আপনার ফাইলটা হয়ে যায় "upload key",
   আর আসল "app signing key" Google-এর কাছে থাকে।
2. **Internal testing** ট্র্যাকে AAB আপলোড করুন (প্রোডাকশনে নয়)।
3. **Pre-launch report**-এর জন্য অপেক্ষা করুন — Firebase Test Lab-এর আসল ডিভাইসে
   ক্র্যাশ, ANR, অ্যাক্সেসিবিলিটি ধরে। সবুজ না হলে এগোবেন না।
4. App content-এর ফরমগুলো (Data safety, Account deletion, Content rating, Target
   audience) — Phase 5, `docs/play-listing.md` দেখুন।

### App Links-এর জন্য SHA-256 (Phase 8)

এনরোল করার পর: Play Console → **Release → Setup → App signing**। ওখানে
*App signing key certificate*-এর SHA-256 পাবেন। ওটাই `.well-known/assetlinks.json`-এ
আর Firebase-এর Android অ্যাপ সেটিংসে দিতে হবে। **আপলোড কী-র SHA নয়** — এটা খুব সাধারণ ভুল।

---

## ৫. প্রতিটি আপডেটে

1. `android/app/build.gradle`-এ `versionCode` **+১**, `versionName` হালনাগাদ
2. কমিট, তারপর নতুন ট্যাগ (`v1.0.1`) পুশ
3. আর্টিফ্যাক্ট নামিয়ে Play-তে আপলোড

versionCode একবার Play-তে গেলে সেটা আর কখনো ব্যবহার করা যায় না — ফেলে দেওয়া
internal বিল্ডের জন্যও নয়।
