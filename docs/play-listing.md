# Play Console — App content ও Store listing

Play Console-এ যা যা ভরতে হবে, সব এক জায়গায়। **Data safety-র উত্তরগুলো কোড পড়ে
বের করা** — অনুমান নয়, প্রতিটির পাশে উৎস দেওয়া আছে। ভুল ঘোষণা দিলে পরে অ্যাপ
সাসপেন্ড হতে পারে, তাই এখান থেকেই হুবহু কপি করুন।

---

## ১. App content — যে ফরমগুলো ভরতেই হবে

| ফরম | উত্তর |
|---|---|
| Privacy policy | `https://alquranicruqyahhealing.com/privacy.html` |
| **Data deletion** | `https://alquranicruqyahhealing.com/privacy.html#delete-account` |
| Ads | **নেই** — অ্যাপে কোনো বিজ্ঞাপন SDK নেই |
| App access | লগইন লাগে এমন অংশ আছে → **রিভিউয়ারের জন্য একটা টেস্ট অ্যাকাউন্ট দিন** (নিচে §৪) |
| Content rating | প্রশ্নমালায় ক্যাটাগরি **Reference**; সহিংসতা/যৌনতা/জুয়া — সব "না" |
| Target audience | **১৮ ও তার বেশি** — এতে Families policy-র বাড়তি শর্ত এড়ানো যায় |
| News app | না |
| COVID-19 apps | না |
| Data safety | §২ |
| Government apps | না |
| Financial features | **না** — অ্যাপে কোনো কেনাকাটা নেই (নেটিভ বিল্ড থেকে পুরো ক্রয় প্রবাহ বাদ) |
| Health apps | **না** — এটি ধর্মীয় আমলের অ্যাপ, চিকিৎসা অ্যাপ নয়। ডিসক্লেমার তিন জায়গায় পিন করা আছে |

**Category:** Books & Reference
**Tags:** Islam, Audio, Reference

> Health & Fitness বা Medical বেছে নেবেন না। ওগুলো বাড়তি রিভিউ ট্রিগার করে, আর
> এই অ্যাপ কোনো চিকিৎসা দাবি করে না।

---

## ২. Data safety — হুবহু এই উত্তরগুলো

সব ক্ষেত্রে সাধারণ উত্তর:

- **Is this data collected, shared, or both?** → **Collected** (Shared নয়)
- **Is this data processed ephemerally?** → না
- **Is data collection required?** → Required (অ্যাকাউন্টের জন্য) / Optional (নিচে যেখানে লেখা)
- **Purpose** → App functionality, Account management
- **Encrypted in transit** → **হ্যাঁ** (সব কিছু HTTPS, Firebase)
- **Users can request deletion** → **হ্যাঁ** (privacy.html#delete-account)

### সংগ্রহ করা হয় ✅

| Data type | Required? | কোথা থেকে |
|---|---|---|
| **Name** | Required | signup ফরম, `saveUserProfile` |
| **Email address** | Required | Firebase Auth |
| **Phone number** | Required | signup ফরম, **এবং OTP লগইন — নম্বরটাই অ্যাকাউন্ট** |
| **User IDs** | Required | Firebase Auth uid |
| **Other personal info** (বয়স, লিঙ্গ, এলাকা) | Optional | signup ফরম |
| **Health info** ⚠️ | Optional | রোগী ফরম, লক্ষণ যাচাই, জার্নাল |
| **Other user-generated content** | Optional | বইয়ের রিভিউ, জার্নাল এন্ট্রি |
| **App interactions** | Optional | favourites, playlists, শোনার পরিসংখ্যান |
| **Purchase history** | Optional | ওয়েবে করা কেনাকাটার রেকর্ড (অ্যাপে কেনা যায় না, কিন্তু আনলক দেখাতে পড়া হয়) |
| **Device or other IDs** | Optional | FCM রেজিস্ট্রেশন টোকেন — পুশ নোটিফিকেশনের জন্য |

> **Device or other IDs কেন "হ্যাঁ":** অ্যাপে কোনো analytics নেই, advertising ID
> নেই, Android ID পড়া হয় না। কিন্তু পুশ নোটিফিকেশনের জন্য Firebase প্রতিটি
> ডিভাইসে একটা রেজিস্ট্রেশন টোকেন বানায়, আর Google-এর নিজের নির্দেশনায় সেটা এই
> ঘরেই পড়ে। আমরা টোকেনটা কোথাও সংরক্ষণ করি না (টপিক `all`-এ পাঠানো হয়,
> দেখুন `docs/notifications.md`) — তবু Firebase-এর কাছে এটা থাকে, তাই ঘোষণা
> করাই সৎ উত্তর। Purpose: **App functionality**।

> **Health info অবশ্যই "হ্যাঁ" দিন।** রোগী ফরম ও লক্ষণ যাচাইয়ে স্বাস্থ্য সংক্রান্ত
> তথ্য নেওয়া হয় এবং তা Firestore-এ জমা থাকে। এটি লুকানো Data safety নীতির
> সরাসরি লঙ্ঘন এবং ধরা পড়লে অ্যাপ সাসপেন্ড হয়।

### সংগ্রহ করা হয় না ❌

Location · Financial info (payment method/card — অ্যাপে কেনা যায় না) · Contacts ·
Calendar · SMS/Call log · Photos/Videos · Audio recordings · Files ·
Crash logs · Diagnostics · Advertising ID

কোনো analytics বা crash-reporting SDK অ্যাপে নেই — তাই এই ঘরগুলো সৎভাবে "না"।

### Third party sharing

**কারো সাথে শেয়ার করা হয় না।** Firebase একটি processor (Google-এর অবকাঠামো),
Play-এর সংজ্ঞায় সেটা "sharing" নয়।

---

## ৩. Store listing

### App name (≤৩০ অক্ষর)

```
Self Ruqyah — রুকইয়াহ অডিও
```

### Short description (≤৮০ অক্ষর)

```
২৭৮টি রুকইয়াহ অডিও, ১৭৮টি গাইড ও দৈনিক আমলের রুটিন — এক অ্যাপে, বাংলায়।
```

### Full description (≤৪০০০ অক্ষর)

```
আল কুরআনিক রুকইয়াহ হিলিং-এর অফিসিয়াল অ্যাপ। কুরআন ও সুন্নাহভিত্তিক রুকইয়াহর
অডিও, লিখিত গাইড এবং দৈনিক আমলের রুটিন — সব এক জায়গায়, বাংলায়।

🎧 রুকইয়াহ অডিও লাইব্রেরি
১৩টি বিভাগে সাজানো ২৭৮টি রুকইয়াহ অডিও। সিহর, বদনজর, জ্বিন, মানসিক চাপ,
ঘুমের সমস্যা, দাম্পত্য ও শারীরিক কষ্ট — প্রতিটির জন্য আলাদা করে বাছাই করা।
প্রিয় অডিও সংরক্ষণ করুন, নিজের প্লেলিস্ট বানান।

📖 পড়ার লাইব্রেরি
৯৬টি লিখিত রুকইয়াহ গাইড ও ৮২টি পিডিএফ — বিষয় অনুযায়ী সাজানো, খুঁজে নেওয়া যায়।
সিহর, বদনজর, জ্বিন, রিজিক, দাম্পত্য ও শিফার আলাদা আলাদা প্রোটোকল, প্রতিটির
সাথে আয়াত ও বাংলা অর্থ। সবই অ্যাপের ভেতরেই পড়া যায় — যেখানে থেমেছিলেন সেই
পাতাটাই মনে রাখে, আর পছন্দেরটা অফলাইনে রেখে দেওয়া যায়।

✍️ ব্লগ ও ধারাবাহিক লেখা
রুকইয়াহ, বদনজর, হাসাদ ও জ্বিন নিয়ে কুরআন-সুন্নাহভিত্তিক লেখা, ধারাবাহিক
সিরিজসহ। নতুন লেখা প্রকাশিত হলে অ্যাপেই চলে আসে।

📿 দৈনিক আমল
তাসবিহ কাউন্টার, দৈনিক দোয়া, ৭ দিনের আমলের রুটিন এবং জার্নাল। ধারাবাহিকতা
(streak) ও সাপ্তাহিক লক্ষ্য দেখে নিজের অগ্রগতি বুঝতে পারবেন।

🔎 লক্ষণ যাচাই
আপনার জানানো লক্ষণ অনুযায়ী কোন আমলগুলো দিয়ে শুরু করবেন তা সাজিয়ে দেয়।
এটি রোগ নির্ণয় নয়।

🗓️ পরামর্শের আবেদন
রাকী ফয়সাল আহমেদ সাবিতের কাছে রুকইয়াহ পরামর্শের জন্য অ্যাপয়েন্টমেন্টের
আবেদন করতে পারবেন।

🔔 নোটিশ
নতুন গাইড, লেখা বা ঘোষণা এলে অ্যাপেই জানানো হয়। না চাইলে ফোনের সেটিংস
থেকে নোটিফিকেশন বন্ধ করে দিতে পারেন।

✨ আরও
• পুরো অ্যাপ বাংলায়
• চোখে আরাম দেয় এমন ডার্ক থিম
• অ্যাকাউন্ট দিয়ে লগইন করলে আপনার পছন্দ ও অগ্রগতি সব ডিভাইসে এক থাকে
• অ্যাপের ভেতর থেকেই অ্যাকাউন্ট মুছে ফেলার সুযোগ

⚠️ গুরুত্বপূর্ণ
রুকইয়াহ চিকিৎসাবিজ্ঞানের বিকল্প নয়। শারীরিক বা মানসিক অসুস্থতায় অবশ্যই যোগ্য
চিকিৎসকের পরামর্শ নিন। কোনো চলমান চিকিৎসা বা ওষুধ এই অ্যাপের কারণে বন্ধ করবেন না।

আল কুরআনিক রুকইয়াহ হিলিং
alquranicruqyahhealing.com
```

> **দাম, "কিনুন", bKash/নগদ — লিস্টিংয়ে একটাও লেখা যাবে না।** Play-এর
> anti-steering নিয়ম স্টোর লিস্টিংয়েও খাটে।

### Graphics

| অ্যাসেট | স্পেক | অবস্থা |
|---|---|---|
| App icon | ৫১২×৫১২ PNG, 32-bit | ✅ সবুজ পাতা, কালো পটভূমি — `assets/icon-only.png` |
| Feature graphic | ১০২৪×৫০০ PNG/JPG, **alpha ছাড়া** | ✅ `assets/feature-graphic.png` |
| Phone screenshots | ২–৮টি, কমপক্ষে ১০৮০×১৯২০ | ✅ ৬টি — `assets/screenshots/` |

আইকন ও splash `node tools/make_brand_assets.js` দিয়ে বানানো হয়, তারপর
`npm run assets`। মার্কটা একটাই SVG path — অ্যাপের হেডার, অনবোর্ডিং ও
নোটিফিকেশন আইকনেও সেই একই পাতা।

> আগের আইকনটা আক্ষরিক অর্থেই **IEC পাওয়ার বাটনের চিহ্ন** ছিল (সবুজ রিংয়ের
> মাঝে দাঁড়ি) — একটা কুরআনিক রুকইয়াহ অ্যাপে।

**স্ক্রিনশটের জন্য ৬টি স্ক্রিন:** হোম · অডিও লাইব্রেরি · ফুল প্লেয়ার ·
PDF রিডার · আমল/তাসবিহ · ৭ দিনের প্রোগ্রাম।

---

## ৪. রিভিউয়ারের জন্য টেস্ট অ্যাকাউন্ট

> **Play Console → App content → Sign-in details** (আগে নাম ছিল *App access*)।
> ২০২৬-০৯-০২-এ *Yes* বেছে "Reviewer account" নামের এন্ট্রি খোলা হয়েছে এবং নিচের
> ইংরেজি নির্দেশনাটা লেখা হয়েছে। **বাকি আছে তিনটে জিনিস, তিনটেই আপনার:**
> ইউজারনেম (ইমেইল), পাসওয়ার্ড, আর "Sign-in details … provide full access …"
> চেকবক্স। তারপর **Add → Save**।
>
> ⚠️ **Target audience ফরমটা এই ঘোষণা সেভ না হওয়া পর্যন্ত খোলেই না** — Play
> নিজেই আটকে রাখে। কাজেই ক্রমটা: টেস্ট অ্যাকাউন্ট → Sign-in details → Target audience।
>
> **"Any other information" ঘরের লেখা (৪৯৪/৫০০ অক্ষর — হুবহু কপি করুন):**
>
> ```
> Most of the app is open without signing in: audio library, written guides, PDF reader, blog, daily-practice tab and symptom checker. Sign-in is needed only for the profile, cross-device sync, the paid-book reader and the members' course area. To sign in: tap the person icon in the bottom navigation, choose Login, then use the email and password above. No 2-step verification, no OTP, no biometric gate; SMS login is disabled. Nothing can be bought inside the app. The interface is in Bengali.
> ```
>
> সীমাটা **৫০০ অক্ষর** — লম্বা করলে "Your changes couldn't be saved" দেখায়
> আর কারণটা নিচে ছোট করে লেখা থাকে, সহজে চোখে পড়ে না।


App access ফরমে একটা কাজ করা লগইন দিতেই হবে, নইলে রিভিউয়ার অর্ধেক অ্যাপ দেখতেই
পাবেন না এবং "could not evaluate" বলে রিজেক্ট হয়।

- একটা সাধারণ ইমেইল/পাসওয়ার্ড অ্যাকাউন্ট বানান (Google দিয়ে নয় — রিভিউয়ার
  আপনার Google অ্যাকাউন্টে ঢুকতে পারবেন না)
- **অ্যাডমিন ইমেইল দেবেন না।** `crackdmcbuet@gmail.com` দিয়ে লগইন করলে অ্যাডমিন
  প্যানেল খুলে যায় — রিভিউয়ার সেটা দেখলে বিভ্রান্ত হবেন
- ওই অ্যাকাউন্টে বইটি আনলক করে রাখুন, যাতে রিডার পুরোটা দেখা যায়

---

## ৫. আপলোডের আগে শেষ চেক

1. `npm run audit:native` — পাস করে?
2. Internal testing-এ AAB আপলোড
3. **Pre-launch report** সবুজ (Firebase Test Lab-এর আসল ডিভাইসে ক্র্যাশ, ANR,
   অ্যাক্সেসিবিলিটি ধরে)
4. উপরের সব ফরম ভরা
5. তারপর ক্লোজড টেস্ট

---

## ৬. ব্যক্তিগত অ্যাকাউন্টের ১২ টেস্টার / ১৪ দিনের শর্ত

Play Console অ্যাকাউন্ট: **`mdfaisalahmedsabit2017@gmail.com`** (personal/individual)।

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

ব্যক্তিগত ডেভেলপার অ্যাকাউন্টে প্রোডাকশনে যাওয়ার আগে Google একটা শর্ত দেয়:

> **কমপক্ষে ১২ জন টেস্টার, একটানা ১৪ দিন ধরে ক্লোজড টেস্টে opted-in থাকতে হবে।**

খুঁটিনাটি যেগুলোতে মানুষ আটকায়:

- **১২ জনকে শুধু যোগ করলেই হয় না — প্রত্যেককে opt-in লিংকে ঢুকে টেস্টে যোগ দিতে হবে।**
  যে যোগ দেয়নি সে গোনায় ধরা হয় না।
- **টানা ১৪ দিন।** মাঝপথে কেউ opt-out করলে বা সংখ্যা ১২-র নিচে নামলে ঘড়ি রিসেট।
- ঘড়ি চালু হয় **প্রথম ক্লোজড-টেস্ট রিলিজ** থেকে, অ্যাকাউন্ট খোলার দিন থেকে নয়।
- ১৪ দিন পূর্ণ হলে Console-এ *Apply for production* বাটন আসে; ওটাও একটা রিভিউ।

**তাই আজই ১২ জন জোগাড় করা শুরু করুন** — পরিবার, বন্ধু, ছাত্র, রুকইয়াহ গ্রুপের
পরিচিত কেউ। প্রত্যেকের **Google অ্যাকাউন্টের ইমেইল** লাগবে (যেটা দিয়ে Play Store
ব্যবহার করেন)। ১২ নয়, **১৫-১৬ জন** রাখলে ভালো — কেউ না কেউ ঝরে যায়।

ভালো দিক: ওই ১৪ দিনে অ্যাপ আটকে থাকে না। যত খুশি আপডেট পাঠানো যায়, আর টেস্টারদের
মতামত নিয়ে UI ঠিক করার জন্য এটাই সবচেয়ে ভালো সময়।

---

## ৭. Play Console — App content সম্পূর্ণ (২০২৬-০৯-০২)

অ্যাপ: *Self Ruqyah — রুকইয়াহ অডিও*, `com.selfruqyah.app`,
অ্যাপ-আইডি `4975353914167930111`, ডেভেলপার অ্যাকাউন্ট
`mdfaisalahmedsabit2017@gmail.com` (`/console/u/1/`), স্ট্যাটাস **Draft**।

**"Finish setting up your app" — ১১/১১ শেষ।** ড্যাশবোর্ড থেকে সেকশনটাই
উধাও হয়ে গেছে, ওটাই সম্পূর্ণ হওয়ার সংকেত।

| কাজ | কী দেওয়া হয়েছে |
|---|---|
| Privacy policy | আগেই ছিল |
| Ads | আগেই ছিল |
| Government apps | **No** |
| Financial features | *doesn't provide any financial features* |
| Health | *does not have any health features* |
| App category ও contact | App · **Books & reference** · `faisalahmedsabit@gmail.com` · সাইটের লিংক (ফোন খালি) |
| Store Listing | বাংলা নাম/short/full description, আইকন ৫১২×৫১২, feature graphic, ৬ স্ক্রিনশট; AI asset declaration = *Don't label assets* |
| **Sign-in details** | রিভিউয়ার অ্যাকাউন্ট `crackdmcbuet+playreview@gmail.com` (পাসওয়ার্ড রাকী নিজে বসিয়েছেন) — তিনটে বই-ই আনলক করা |
| **Content rating** | IARC সম্পূর্ণ। Category *All other app types*; **User content sharing = Yes** (অ্যাপে রিভিউ লেখা যায়), বাকি উপ-প্রশ্ন সব No; **Online content = Yes** (অডিও/গাইড নেটওয়ার্ক থেকে আসে), Violence/Sexuality/Language/Drugs সব No; Miscellaneous পাঁচটাই No। ফল: L · E · 3 · 3+ · USK 16 |
| **Target audience** | **18 and over** |
| **Data safety** | ১০টি ডেটা টাইপই সম্পূর্ণ (নিচে) |

### Data safety — যা জমা আছে

- Collect/share required data types → **Yes**; encrypted in transit → **Yes**
- Account creation → **Username and password** + **OAuth**
- Delete account URL → `https://alquranicruqyahhealing.com/privacy.html#delete-account`
- প্রতিটি টাইপে: **Collected** (Shared নয়), ephemeral **No**,
  purposes **App functionality + Account management**
  (ব্যতিক্রম: *Device or other IDs* — শুধু App functionality)

| ডেটা টাইপ | Required / Optional |
|---|---|
| Name · Email address · User IDs · Phone number | **Required** |
| Other info · Purchase history · Health info · App interactions · Other user-generated content · Device or other IDs | **Optional** |

> **Health দুই জায়গায় দুরকম, ইচ্ছাকৃত:** *Health apps* = "কোনো health feature নেই"
> (অ্যাপ চিকিৎসা-ফিচার দেয় না), কিন্তু *Data safety*-তে **Health info সংগ্রহ = হ্যাঁ**
> (লক্ষণ যাচাই ও জার্নালে স্বাস্থ্যতথ্য জমা হয়)। দুটো আলাদা ঘোষণা।

### Play Console অটোমেট করার সময় যা শিখলাম

- **ডেটা-টাইপ ডায়ালগ রেন্ডার হতে ২০–৩০ সেকেন্ড লাগে।** সাথে সাথে খুঁজলে
  "ডায়ালগ নেই" মনে হয় — অপেক্ষা করে আবার দেখতে হয়।
- **ডায়ালগের Save যথেষ্ট নয় — পাতার নিচের `Save draft` না চাপলে সব মুছে যায়।**
  একবার চারটে সম্পূর্ণ করা টাইপ এভাবেই হারিয়েছিল। প্রতিটার পরেই Save draft।
- পুরনো ডায়ালগ DOM-এ জমে থাকে, তাই **শিরোনাম মিলিয়ে** ঠিক ডায়ালগটা বাছতে হয়;
  নইলে আগেরটাই আবার ভরে ফেলে।
- ড্রপডাউনে কোঅর্ডিনেট-ক্লিক ভুল আইটেম বসায় (একবার Category "Beauty" হয়ে গিয়েছিল) —
  `[role="option"]`-এ সরাসরি MouseEvent dispatch করাই নির্ভরযোগ্য।

---

## ৮. এখন যা বাকি — সবই রাকীর হাতে

1. **Internal testing-এ রিলিজটা roll out করা** (এখন "1 of 3 complete":
   *Select testers* ও *Preview and confirm the release* বাকি)
2. **১২–১৬ জন টেস্টারের Gmail সংগ্রহ** → Closed testing ট্র্যাকে যোগ →
   opt-in লিংক পাঠানো
3. **একটানা ১৪ দিন** কমপক্ষে ১২ জন opted-in থাকা
4. তারপর *Apply for production*

**সাইডলোড করা APK এই গোনায় ধরে না** — টেস্টারদের Play-র closed testing
ট্র্যাক থেকেই ইনস্টল করতে হবে।

---

## ৯. টেস্টার তালিকা ও Closed testing (২০২৬-০৯-০২, সন্ধ্যা)

**ফেসবুক পোস্ট থেকে ১০২টা Gmail এসেছে।** যাচাই করে দেখা গেল ডুপ্লিকেট নেই,
তবে **তিনটেতে টাইপো** — এগুলো কাজ করবে না:

```
sinthyaaktersinthyaakter4@gamil.com   (gamil.com)
wu42780@gmail.con                     (.con)
tiloqtara@email.com                   (gmail নয়)
```

বাকি **৯৯টা** পরিষ্কার। তালিকা `C:\Users\faisa\testers-clean.txt`-এ।

**Play Console-এ ইমেইল লিস্ট তৈরি হয়ে গেছে:**
*"Self Ruqyah testers (FB post, Sept 2026)"* — Users **99**।
লিস্ট অ্যাকাউন্ট-লেভেলে থাকে, তাই যেকোনো ট্র্যাকে পুনর্ব্যবহারযোগ্য।
**Internal testing**-এ যুক্ত ও সেভ করা (*Select testers* ✓, ট্র্যাক এখন 2 of 3)।

### ⚠️ Internal ≠ Closed — ঘড়ি কেবল Closed-এ চলে

| | Internal | Closed |
|---|---|---|
| কতজন | ১০০ | সীমাহীন |
| রিভিউ | লাগে না | লাগে |
| **১২×১৪ দিনের গোনায়** | **না** | **হ্যাঁ** |

তাই ৯৯ জনকে **Closed testing – Alpha** ট্র্যাকে বসাতে হবে।

### যেখানে আটকে আছে

`Closed testing – Alpha` ট্র্যাক আছে (Inactive, রিলিজ নেই)। কাজগুলো:
*Select country* · *Select testers* · *Create a new release* ·
🔒 *Preview and confirm* · 🔒 *Send the release to Google for review*।

**Select country-তে দেশের চেকবক্স সাড়া দিচ্ছে না** — সব সারি "Not targeted",
আর *Edit countries/regions* বোতাম **disabled**। সম্ভবত ট্র্যাকে **আগে একটা
রিলিজ তৈরি করতে হয়**, তারপর দেশ নির্বাচন খোলে। পরের বার এই ক্রমে চেষ্টা করতে হবে:
**Create a new release (AAB আপলোড) → Select country → Select testers → review-এ পাঠানো।**

AAB প্রস্তুত: `android\app\build\outputs\bundle\release\app-release.aab` (৬.৬৭ MB)।


## ৮. Closed testing রিলিজ — ২০২৬-০৯-০৩

- Play এখন **targetSdk ≥ 36** চায়; 35 দিয়ে রিলিজ Save-ই হয় না ("must target at least API level 36")।
  তাই `android/variables.gradle`-এ compileSdk/targetSdk **36**, আর `app/build.gradle`-এ
  **versionCode 2, versionName 1.0.1** (versionCode 1 Play-তে গেছে, আর ব্যবহারযোগ্য নয়)।
  AGP 8.7.2-তে compileSdk 36 শুধু warning দেয়, বিল্ড হয়। নতুন AAB: `C:\Users\faisa\SelfRuqyah-1.0.1-vc2.aab`
  (৬.৩৬ MB, RUQYAH-U দিয়ে সাইনড, merged manifest-এ targetSdk 36 / versionCode 2 যাচাই করা)।
- Closed testing (Alpha) রিলিজ **"1.0.1 (2) — প্রথম ক্লোজড টেস্ট"** — bundle 1 সরিয়ে bundle 2 বসানো, Save করা।
  বাকি একমাত্র warning: deobfuscation file নেই (R8 ব্যবহার হয় না, উপেক্ষা করা যায়)।
- **রিভিউতে পাঠানো (Publishing overview → "Send 1 change for review") রাকী নিজে চাপবেন** —
  এটা পাবলিশ-অ্যাকশন, Claude-এর অটোমেশন নীতিতে আটকায়।
- টেস্টারদের opt-in লিংক: `https://play.google.com/apps/testing/com.selfruqyah.app` —
  রিভিউ পাস করে ট্র্যাক লাইভ হলে কাজ করবে (Testers ট্যাবে "Copy link"-এ একই লিংক দেখাবে)।
  **closed test বলে শুধু email list-এ থাকা Gmail-ই যোগ দিতে পারবে** — Testers ট্যাবের list-এ
  Gmail যোগ করতে হবে, তারপর Save।

**২০২৬-০৯-০৩, ৩:২৮ pm — Submission #1 Published।** Closed testing (Alpha) 1.0.1 (2), Store Listing, App Content,
Store settings — সব একসাথে অনুমোদিত (রিভিউতে এক ঘণ্টাও লাগেনি)। টেস্টার লিংক দুটো লাইভ:
- Join on the web: `https://play.google.com/apps/testing/com.selfruqyah.app`
- Join on Android (Play Store): `https://play.google.com/store/apps/details?id=com.selfruqyah.app`
ইমেইল লিস্টে ৯৯ জন। এখন ১২+ opt-in → টানা ১৪ দিন → Apply for production।
