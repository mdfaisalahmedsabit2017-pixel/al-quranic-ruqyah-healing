# guides_src — রুকইয়াহ ডকুমেন্ট

এখানে ৭০টা ফিনিশড রুকইয়াহ ডকুমেন্ট আছে, HTML হিসেবে:

- **৪০টা টপিক প্রোটোকল** — `<slug>.html`
- **৩০টা আয়াত সংকলন** — `ayat-<topic>.html`
- **`assets/fonts.css`** — ৩.৩ MB, base64-এমবেডেড ৬টা ফন্ট (AlQuran IndoPak, Noto
  Naskh Arabic, Noto Sans/Serif Bengali, Hind Siliguri)। ৭০টা পেজ এটাই শেয়ার করে।
- **`files/`** — ডাউনলোডের ফাইল, ১১০টা / ১২০ MB: ৭০টা `<slug>.pdf` (৪০ টপিক +
  ৩০ সংকলন) ও ৪০টা `<slug>.docx` (শুধু টপিক — সংকলনের DOCX ইঞ্জিনই বানায় না)।
  PDF আর DOCX একই ফোল্ডারে রাখা হয়েছে ইচ্ছাকৃতভাবে: `.vercelignore`-এ `docx/`
  আছে, আর ওই প্যাটার্ন যেকোনো গভীরতায় ম্যাচ করে — আলাদা `docx/` ফোল্ডার বানালে
  ফাইলগুলো চুপচাপ deploy থেকে বাদ পড়ত।

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

# ডাউনলোডের ফাইল — শুধু যেগুলোর পেজ আছে সেগুলোই।
# (output\pdf\-এ আরও ২১টা PDF আছে যাদের কোনো পেজ নেই, আর ২৪ MB-র
#  00-index.pdf = ৭৮১ পৃষ্ঠার মাস্টার বই। এগুলো deploy করা হয় না।)
$out = Split-Path $src -Parent
foreach ($s in (Get-ChildItem -LiteralPath $dst -Filter *.html).BaseName) {
  $p = if ($s -like 'ayat-*') { "$out\pdf\alroqya\$s.pdf" } else { "$out\pdf\$s.pdf" }
  Copy-Item $p "$dst\files\$s.pdf" -Force
  if ($s -notlike 'ayat-*') { Copy-Item "$out\docx\$s.docx" "$dst\files\$s.docx" -Force }
}
```

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
| `../pdf/<slug>.pdf`, `../docx/<slug>.docx`, `../../pdf/alroqya/<slug>.pdf` → `/guides/_files/<slug>.<ext>` | তিন রকম রিলেটিভ পাথ এক জায়গায়; ফাইলগুলো `files/` থেকে কপি হয় |
| `</head>`-এর আগে canonical + OG/Twitter + JSON-LD (`Article` + `BreadcrumbList`) | সোর্স জানে না কোন URL-এ বসবে |

প্রতিটা rewrite ম্যাচ না করলে বিল্ড থামে, আর কোনো পেজ যে ফাইল লিংক করে সেটা
`files/`-এ না থাকলেও বিল্ড থামে — চুপচাপ ডেড লিংক বা ৪০৪ ডাউনলোড বাটন নিয়ে
ডিপ্লয় হওয়ার চেয়ে বিল্ড ফেল করা ভালো।

> **`_files/` কেন, রুটের `pdf/` নয়:** সাইটের `pdf/` ফোল্ডারে আগে থেকেই ৮২টা
> ভিন্ন PDF আছে (`pdf_list.json`), আর তার একটার নাম `ashik-jinn.pdf` — এখানের
> একটা স্লাগের সাথে হুবহু মিলে যায় কিন্তু কনটেন্ট আলাদা। আলাদা ফোল্ডারে রাখায়
> সংঘর্ষের প্রশ্নই আসে না।

> **সাইজ:** `_files/` যোগ হওয়ায় `public/` ১৫৯ → ২৭৯ MB। `native/` অপরিবর্তিত
> (৩.৮ MB) — APK-তে এসব যায় না।
