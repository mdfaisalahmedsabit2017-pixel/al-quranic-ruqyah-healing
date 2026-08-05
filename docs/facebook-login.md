# Facebook দিয়ে লগইন — সেটআপ

কোড বসানো আছে, বাটনও আছে — কিন্তু **লুকানো**, কারণ Facebook অ্যাপ তৈরি না করা পর্যন্ত ওটা চাপলে শুধু এরর দেখাত। নিচের ধাপগুলো শেষ করে সবশেষে চালু করবেন।

> **কেন লুকানো:** যে লগইন বাটন সবসময় ব্যর্থ হয়, সেটা যতটা সুবিধা দেয় তার চেয়ে বেশি আস্থা নষ্ট করে। ব্যবহারকারী তখন কাজ করা বাটনগুলোকেও সন্দেহ করে।

---

## ১ · Facebook অ্যাপ তৈরি

1. https://developers.facebook.com/apps → **Create App**
2. Use case: **Authenticate and request data from users with Facebook Login**
3. অ্যাপের নাম: `Self Ruqyah`
4. তৈরি হলে **App settings → Basic**-এ পাবেন:
   - **App ID** (সংখ্যা)
   - **App Secret** (Show চেপে দেখুন)
5. একই পাতায় **Client Token** (Settings → Advanced → Security → Client token)

## ২ · Firebase-এ provider চালু

Firebase Console → **Authentication** → **Sign-in method** → **Facebook** → Enable

- App ID ও App Secret বসান
- Firebase যে **OAuth redirect URI** দেখাবে সেটা কপি করুন
- Facebook ড্যাশবোর্ড → **Facebook Login → Settings** → *Valid OAuth Redirect URIs*-এ পেস্ট করুন

এটুকু হলেই **ওয়েবসাইটে** Facebook লগইন কাজ করবে।

## ৩ · Android

### ক) key hash

Facebook অ্যাপের Android প্ল্যাটফর্মে debug ও release **দুটোরই** key hash লাগে। keystore তৈরি হওয়ার পর (`docs/release.md`):

```bash
keytool -exportcert -alias ruqyah-upload -keystore /path/to/ruqyah-upload.keystore \
  | openssl sha1 -binary | openssl base64
```

Play App Signing চালু থাকলে Play Console → *App integrity* থেকে Google-এর সার্টিফিকেটেরও একটা hash লাগবে — SHA-1-এর মতোই, প্রথম আপলোডের পরেই পাওয়া যায়।

Facebook ড্যাশবোর্ড → **Settings → Basic → Add Platform → Android**:
- Package name: `com.selfruqyah.app`
- Class name: `com.selfruqyah.app.MainActivity`
- Key hashes: উপরের দুটো

### খ) রিসোর্স ফাইল

`android/app/src/main/res/values/facebook.xml` তৈরি করুন — **এই ফাইলটি কমিট করবেন না**, `android/.gitignore`-এ ধরা আছে:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="facebook_app_id">১২৩৪৫৬৭৮৯</string>
    <string name="facebook_client_token">আপনার client token</string>
    <string name="fb_login_protocol_scheme">fb১২৩৪৫৬৭৮৯</string>
</resources>
```

`AndroidManifest.xml`-এ `<application>`-এর ভেতরে যোগ করুন:

```xml
<meta-data android:name="com.facebook.sdk.ApplicationId" android:value="@string/facebook_app_id"/>
<meta-data android:name="com.facebook.sdk.ClientToken" android:value="@string/facebook_client_token"/>
<activity android:name="com.facebook.FacebookActivity"
          android:configChanges="keyboard|keyboardHidden|screenLayout|screenSize|orientation"
          android:exported="true" />
<activity android:name="com.facebook.CustomTabActivity" android:exported="true">
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="@string/fb_login_protocol_scheme" />
    </intent-filter>
</activity>
```

`<queries>`-এ যোগ করুন যাতে Facebook অ্যাপ ইনস্টল থাকলে সেটাই ব্যবহার হয়:

```xml
<package android:name="com.facebook.katana" />
```

### গ) লাইব্রেরি চালু

`android/variables.gradle`:

```gradle
rgcfaIncludeFacebook = true
```

> ⚠️ **ক্রম মানতেই হবে।** `facebook.xml`-এর আগে এটা `true` করলে অ্যাপ **চালু হওয়ার সাথে সাথেই ক্র্যাশ করবে** — Facebook SDK-র manifest ওই দুটো string রিসোর্স *বাধ্যতামূলক* করে। বাটন না থাকা নয়, পুরো অ্যাপ বন্ধ।

## ৪ · বাটন চালু

`firebase-config.js`:

```js
window.FACEBOOK_ENABLED = true;
```

`npm run check` চালান, তারপর নতুন বিল্ড।

---

## যাচাই

| | |
|---|---|
| ওয়েব | `/app` → লগইন → Facebook → পপআপে সম্মতি → নাম ও ছবি এলো |
| অ্যান্ড্রয়েড | একই, তবে Chrome Custom Tab বা Facebook অ্যাপে খুলবে |
| একই ইমেইল | আগে Google দিয়ে খোলা অ্যাকাউন্টে Facebook চাপলে বাংলায় বার্তা আসবে — ক্র্যাশ নয় |

## Play Store

Facebook SDK যোগ করলে **Data safety** ফরম বদলায় না (নতুন কোনো তথ্য সংগ্রহ হচ্ছে না), কিন্তু Facebook অ্যাপটিকে **Business Verification** করাতে হতে পারে যদি `public_profile`-এর বাইরে কিছু চান। শুধু নাম-ছবি-ইমেইলের জন্য দরকার নেই।
