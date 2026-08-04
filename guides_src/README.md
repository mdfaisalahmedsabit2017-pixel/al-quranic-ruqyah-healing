# guides_src — রুকইয়াহ ডকুমেন্ট

এখানে ৭০টা ফিনিশড রুকইয়াহ ডকুমেন্ট আছে, HTML হিসেবে:

- **৪০টা টপিক প্রোটোকল** — `<slug>.html`
- **৩০টা আয়াত সংকলন** — `ayat-<topic>.html`
- **`assets/fonts.css`** — ৩.৩ MB, base64-এমবেডেড ৬টা ফন্ট (AlQuran IndoPak, Noto
  Naskh Arabic, Noto Sans/Serif Bengali, Hind Siliguri)। ৭০টা পেজ এটাই শেয়ার করে।
- **`files/`** — ডাউনলোডের PDF, ৭০টা / ১২৪ MB। **হাতে কপি করবেন না** —
  `python tools/watermark_pdfs.py` দিয়ে জেনারেট করতে হয় (নিচে দেখুন)।
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

## নতুন বিল্ড সিঙ্ক করা

```powershell
$src = "A:\claude code projects sabit\ruqyah pdf maker\output\html"
$dst = "A:\Ruqyah Audio App\guides_src"

# ৪০টা টপিক (সোর্সের index.html বাদ — সাইটের ইনডেক্স আলাদা)
Get-ChildItem -LiteralPath $src -Filter *.html |
  Where-Object { $_.Name -ne 'index.html' } |
  ForEach-Object { Copy-Item $_.FullName "$dst\$($_.Name)" -Force }

# ৩০টা সংকলন, ফ্ল্যাট করে (নাম সব `ayat-` দিয়ে শুরু, তাই সংঘর্ষ হয় না)
Get-ChildItem -LiteralPath "$src\alroqya" -Filter *.html |
  Where-Object { $_.Name -ne 'index.html' } |
  ForEach-Object { Copy-Item $_.FullName "$dst\$($_.Name)" -Force }

Copy-Item "$src\assets\fonts.css" "$dst\assets\fonts.css" -Force
```

তারপর PDF-গুলো ওয়াটারমার্ক করুন (এটাই `files/` ভরে):

```powershell
python tools\watermark_pdfs.py
```

স্ক্রিপ্টটা শুধু যেসব স্লাগের HTML পেজ আছে তাদের PDF নেয় — `output\pdf\`-এ আরও
২১টা PDF আছে যাদের কোনো পেজ নেই, আর ২৪ MB-র `00-index.pdf` = ৭৮১ পৃষ্ঠার
মাস্টার বই; ওগুলো পাবলিশ হয় না। পুরনো `.docx` থাকলে মুছে দেয়।

তারপর `node build.js --target=web` → commit → push করলেই Vercel-এ লাইভ।

## নতুন ডকুমেন্ট যোগ করলে

`guides.json`-এ ক্যাটাগরি বসাতে হবে, নইলে **বিল্ড ফেল করবে** (ইচ্ছাকৃত — না বসালে
ডকুমেন্টটা চুপচাপ ইনডেক্স থেকে বাদ পড়ত):

- টপিক হলে `"slugs"`-এ `"<slug>": "<ক্যাটাগরির বাংলা নাম>"` যোগ করুন।
- `ayat-` দিয়ে শুরু হলে কিছু করতে হবে না — `"prefixCategory"` ধরে নেয়।
- একদম নতুন ক্যাটাগরি হলে আগে `"categories"`-এ `bn` + `blurb` দিয়ে যোগ করুন
  (ক্রমটাই ইনডেক্স পেজের ক্রম)।

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
