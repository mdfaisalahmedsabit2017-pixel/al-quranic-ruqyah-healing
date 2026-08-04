# guides_src — রুকইয়াহ ডকুমেন্ট

এখানে ৯৬টা ফিনিশড রুকইয়াহ ডকুমেন্ট আছে, HTML হিসেবে:

- **৫টা প্রবন্ধ** — `articles_jundul.py` থেকে
- **৪০টা টপিক প্রোটোকল** — `topics_{sihr,jinn,nazar_rizq,poribar,sharirik}.py`
- **২১টা রুকইয়াহ আয়াত সিরিজ** — `topics_jundul.py` (জুন্দ আল-জানুব সংকলন)
- **৩০টা আয়াত সংকলন** — `collections_alroqya.py`
- **`assets/fonts.css`** — ৩.৩ MB, base64-এমবেডেড ৬টা ফন্ট (AlQuran IndoPak, Noto
  Naskh Arabic, Noto Sans/Serif Bengali, Hind Siliguri)। ৭০টা পেজ এটাই শেয়ার করে।
- **`files/`** — ডাউনলোডের PDF, ৯৬টা / ১৭৪ MB, সাথে `sources.json`।
  **হাতে কপি করবেন না** — `python tools/watermark_pdfs.py` দিয়ে জেনারেট করতে হয়।
  `sources.json` প্রতিটা সোর্স PDF-এর sha256 রাখে, তাই **যেটা বদলায়নি সেটা আবার
  স্ট্যাম্প হয় না** — নইলে প্রতিবার র‍্যান্ডম owner password-এর কারণে ৯৬টা ফাইলের
  বাইট বদলে যেত আর প্রতি সিঙ্কে ১৭৪ MB অকারণে git history-তে জমত।
- **`guides.json`** — ক্যাটাগরি ও slug→ক্যাটাগরি ম্যাপ। engine-এর কনটেন্ট মডিউল
  থেকে **জেনারেট করা**, হাতে এডিট করার চেয়ে রিজেনারেট করা ভালো।
  **DOCX পাবলিশ করা হয় না** — এডিটেবল ফাইলে ওয়াটারমার্ক এক সেভেই উঠে যায়,
  তাই পাইরেসি ঠেকানো অসম্ভব। `tools/guides.js` DOCX বাটনটা বিল্ড টাইমে ফেলে দেয়।

`node build.js --target=web` চালালে `tools/guides.js` প্রতিটাকে
`public/guides/<slug>/index.html`-এ বসায়, আর `tools/library.js` তার উপরে
`public/guides/index.html` ইনডেক্সটা বানায়। native বিল্ডে এগুলো যায় না।

## এই ফাইলগুলো হাতে এডিট করবেন না

আসল সোর্স অন্য প্রজেক্টে:

```
A:\claude code projects sabit\ruqyah pdf maker\
```

ওখানে কনটেন্ট থাকে Python dict হিসেবে (`content/topics_*.py`,
`content/collections_alroqya.py`), আর `python engine/build.py` সেগুলো থেকে
HTML + PDF + DOCX + PNG কার্ড জেনারেট করে। এখানের HTML ওই আউটপুটের হুবহু কপি —
এখানে এডিট করলে পরের সিঙ্কে মুছে যাবে।

## নতুন বিল্ড সিঙ্ক করা — তিনটে কমান্ড

আগে engine-এ বিল্ড করুন (তিন পরিবার আলাদা কমান্ড):

```powershell
cd "A:\claude code projects sabit\ruqyah pdf maker"
python engine/validate.py            # আগে গেট — ALL CLEAN না হলে থামুন
python engine/build.py --skip png
python engine/build.py --collections
python engine/build.py --articles
```

তারপর এই রিপোতে:

```powershell
cd "A:\Ruqyah Audio App"
python tools\sync_guides.py          # HTML + fonts.css আনে
python tools\watermark_pdfs.py       # PDF ওয়াটারমার্ক করে files/-এ বসায়
node build.js --target=web
```

`sync_guides.py` **ফাইলের লিস্ট hardcode করে না** — engine-এর নিজের কনটেন্ট
মডিউলকে জিজ্ঞেস করে কী কী আছে, তাই ওখানে নতুন ডকুমেন্ট যোগ হলে এখানে বাদ পড়ার
সুযোগ নেই। slug ডুপ্লিকেট হলে বা কোনো ডকুমেন্ট রেন্ডার না থাকলে থেমে যায়, আর
engine থেকে মুছে যাওয়া ডকুমেন্ট এখান থেকেও সরিয়ে দেয়।

`watermark_pdfs.py` শুধু যেসব স্লাগের HTML পেজ আছে তাদের PDF নেয় — `output\pdf\`-এ
আরও কিছু PDF আছে যাদের কোনো পেজ নেই, আর ২৪ MB-র `00-index.pdf` = ৭৮১ পৃষ্ঠার
মাস্টার বই; ওগুলো পাবলিশ হয় না। পুরনো `.docx` থাকলে মুছে দেয়।

তারপর `node build.js --target=web` → commit → push করলেই Vercel-এ লাইভ।

## নতুন ডকুমেন্ট যোগ করলে

`guides.json`-এর `"slugs"`-এ ক্যাটাগরি বসাতে হবে, নইলে **বিল্ড ফেল করবে**
(ইচ্ছাকৃত — না বসালে ডকুমেন্টটা চুপচাপ ইনডেক্স থেকে বাদ পড়ত)।

**prefix দিয়ে অনুমান করার কোনো নিয়ম রাখা হয়নি, সজ্ঞানে** — কারণ
`collections_alroqya`-র ৩০টা আর `topics_jundul`-এর ২১টা **দুই পরিবারই `ayat-`
দিয়ে শুরু**। prefix নিয়ম থাকলে নতুন jundul ডকুমেন্ট চুপচাপ "আয়াত সংকলন"-এ
ঢুকে যেত। তাই প্রতিটা slug আলাদা করে লেখা।

একদম নতুন ক্যাটাগরি হলে আগে `"categories"`-এ `bn` + `blurb` দিয়ে যোগ করুন —
ওই ক্রমটাই `/guides/` পেজের সেকশনের ক্রম।

টাইটেল ও ডেসক্রিপশন `guides.json`-এ লেখা **নেই** — `tools/guides.js` প্রতিটা
ডকুমেন্টের নিজের `<title>` ও `<meta name="description">` থেকে পড়ে নেয়, যাতে দুই
জায়গায় দুইরকম হয়ে যাওয়ার সুযোগ না থাকে।

## বিল্ড টাইমে যা যা বদলানো হয়

সোর্স ফাইল অপরিবর্তিত থাকে; `tools/guides.js` কপি করার সময় বদলায়:

| কী | কেন |
|---|---|
| `assets/fonts.css` ও `../assets/fonts.css` → `/guides/_assets/fonts.css` | টপিক ও সংকলনের রিলেটিভ পাথ দুই রকম; ফন্ট একবারই নামে (immutable cache header দেওয়া আছে `vercel.json`-এ) |
| `<a class="home" href="index.html">` → `/guides/` | সোর্সের sibling index এখানে নেই |
| `../pdf/<slug>.pdf` ও `../../pdf/alroqya/<slug>.pdf` → `/guides/_files/<slug>.pdf` | দুই রকম রিলেটিভ পাথ এক জায়গায়; ফাইল `files/` থেকে কপি হয় |
| DOCX বাটনের পুরো `<a>` ট্যাগ বাদ | DOCX পাবলিশ করা হয় না (উপরে দেখুন) |
| `</head>`-এর আগে canonical + OG/Twitter + JSON-LD (`Article` + `BreadcrumbList`) | সোর্স জানে না কোন URL-এ বসবে |

প্রতিটা rewrite ম্যাচ না করলে বিল্ড থামে, আর কোনো পেজ যে ফাইল লিংক করে সেটা
`files/`-এ না থাকলেও বিল্ড থামে — চুপচাপ ডেড লিংক বা ৪০৪ ডাউনলোড বাটন নিয়ে
ডিপ্লয় হওয়ার চেয়ে বিল্ড ফেল করা ভালো।

> **`_files/` কেন, রুটের `pdf/` নয়:** সাইটের `pdf/` ফোল্ডারে আগে থেকেই ৮২টা
> ভিন্ন PDF আছে (`pdf_list.json`), আর তার একটার নাম `ashik-jinn.pdf` — এখানের
> একটা স্লাগের সাথে হুবহু মিলে যায় কিন্তু কনটেন্ট আলাদা। আলাদা ফোল্ডারে রাখায়
> সংঘর্ষের প্রশ্নই আসে না।

> **সাইজ:** `_files/` যোগ হওয়ায় `public/` ১৫৯ → ২৮৩ MB। `native/` অপরিবর্তিত
> (৩.৮ MB) — APK-তে এসব যায় না।

## ওয়াটারমার্ক ও কনটেন্ট প্রোটেকশন

`tools/watermark_pdfs.py` প্রতিটা PDF-এ দুটো জিনিস করে:

1. **প্রতিটা পৃষ্ঠায় টাইলড ডায়াগোনাল ওয়াটারমার্ক** (`alquranicruqyahhealing.com`),
   ৪৫°, প্রতি সারিতে অফসেট করা যাতে ফাঁকা করিডোর না থাকে। এটা PDF **অ্যানোটেশন
   নয়, পেজের কনটেন্ট স্ট্রিমে** লেখা — অ্যানোটেশন যেকোনো ভিউয়ারে এক ক্লিকে মোছা
   যায়, কনটেন্ট যায় না। সাথে নিচের মার্জিনে ছোট অ্যাট্রিবিউশন লাইন।
2. **AES-256 এনক্রিপশন**, user password খালি (সবাই খুলতে পারবে) আর owner password
   র‍্যান্ডম। প্রিন্ট ও স্ক্রিন-রিডার **চালু**, কপি ও মডিফাই **বন্ধ**।

ওয়াটারমার্কের লেখা **ইংরেজিতে, ইচ্ছাকৃতভাবে** — PyMuPDF-এর টেক্সট ইনসার্শনে
complex-script shaping নেই, তাই বাংলা মাত্রা/যুক্তাক্ষর আর আরবি জোড়া ভেঙে যেত।
ডোমেইন ও রোমান নামই আসল শনাক্তকারী অংশ।

কোনোটাই অভেদ্য নয় — পাবলিক কিছুই নয় — কিন্তু একসাথে এর মানে: চুরি হওয়া কপিতেও
প্রতিটা পৃষ্ঠায় সেন্টারের ডোমেইন থাকবে, আর চুপচাপ এডিট করে নিজের নামে চালানো যাবে না।

কপি/মডিফাই খুলে দিতে চাইলে `watermark_pdfs.py`-র `permissions=` লাইনে
`fitz.PDF_PERM_COPY` যোগ করুন।
