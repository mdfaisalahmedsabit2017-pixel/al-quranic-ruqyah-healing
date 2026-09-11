"""কোর্সের নোট PDF গুলোতে মালিকানার ছাপ বসায় — গাইডের PDF এর হুবহু একই ব্যবস্থায়।

    python tools/watermark_course_notes.py
    python tools/watermark_course_notes.py --course course-live

make_course_notes.js যে PDF বানায় সেটাই জায়গায় বসে বদলে যায় (in-place), কারণ
সোর্স HTML থেকে যেকোনো সময় আবার বানানো যায় — আলাদা করে কাঁচা কপি রাখার দরকার নেই।

দুটো ব্যবস্থা, tools/watermark_pdfs.py থেকে হুবহু ধার করা (সেখানকার হেডারে কেন
তার পুরো ব্যাখ্যা আছে):

1. ৪৫° কোণে টাইল করা ওয়াটারমার্ক, পাতার *কনটেন্ট স্ট্রিমের ভেতরে* — annotation
   নয়। annotation যেকোনো ভিউয়ারে এক ক্লিকে মোছা যায়, কনটেন্ট যায় না।
2. AES-256, খালি user password আর এলোমেলো owner password — ফাইল সবার জন্য খোলে,
   কিন্তু কপি ও এডিট বন্ধ। প্রিন্ট আর স্ক্রিন-রিডার খোলা রাখা হয়, কারণ সেগুলো
   বন্ধ করলে শাস্তি পান যাঁর জন্য নোটটা বানানো।

এটা DRM নয়। ডাউনলোড করা PDF ডাউনলোড করাই — এই ছাপ চুরি ঠেকায় না, চুরি করা কপির
প্রতিটা পাতায় সেন্টারের ঠিকানা লিখে রাখে আর নীরবে এডিট করা আটকায়।

ওয়াটারমার্কের লেখা ইচ্ছাকৃতভাবে ল্যাটিন হরফে: PyMuPDF জটিল লিপির শেপিং করে না,
তাই বাংলা যুক্তাক্ষর ও আরবির জোড়া ভেঙে বসত — আর উৎসের পরিচয়টা এই দুই লাইনেই আছে।
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import fitz  # PyMuPDF
import secrets

# watermark_pdfs.py এর main() __name__-গার্ডেড, তাই import করা নিরাপদ — আর
# এতে ছাপের চেহারা দুই জায়গায় আলাদা হয়ে যাওয়ার সুযোগ থাকে না।
from watermark_pdfs import stamp, SIGN, MARK  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
NOTES = REPO / "course_notes"
MANIFEST = NOTES / "stamped.json"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--course", default=None, help="শুধু এই কোর্সটা")
    args = ap.parse_args()

    if not NOTES.is_dir():
        print("!! course_notes/ নেই — আগে tools/make_course_notes.js চালান", file=sys.stderr)
        return 1

    roots = [NOTES / args.course] if args.course else sorted(p for p in NOTES.iterdir() if p.is_dir())
    if args.course and not roots[0].is_dir():
        print(f"!! নেই: {roots[0]}", file=sys.stderr)
        return 1

    seen = json.loads(MANIFEST.read_text("utf-8")) if MANIFEST.is_file() else {}
    done = skipped = pages = 0

    for root in roots:
        for src in sorted(root.glob("*.pdf")):
            key = f"{root.name}/{src.name}"
            digest = hashlib.sha256(src.read_bytes()).hexdigest()
            # ছাপ বসানোর পর ফাইলটা বদলে যায়, তাই ম্যানিফেস্টে *ফলাফলের* হ্যাশ
            # রাখা হয় — একই ফাইল দুবার ছাপ পড়ে ধোঁয়াটে হয়ে যাবে না।
            if seen.get(key) == digest:
                skipped += 1
                continue

            doc = fitz.open(src)
            for n, page in enumerate(doc):
                stamp(page, light=(n == 0))
            count = doc.page_count
            pages += count
            doc.set_metadata({
                "title": src.stem,
                "author": SIGN,
                "creator": "Al Quran Ruqyah Healing Center",
                "producer": MARK,
            })
            tmp = src.with_suffix(".stamped.pdf")
            doc.save(
                tmp,
                encryption=fitz.PDF_ENCRYPT_AES_256,
                owner_pw=secrets.token_urlsafe(24),
                user_pw="",
                permissions=fitz.PDF_PERM_PRINT | fitz.PDF_PERM_ACCESSIBILITY,
                garbage=3, deflate=True,
            )
            doc.close()
            tmp.replace(src)
            seen[key] = hashlib.sha256(src.read_bytes()).hexdigest()
            done += 1
            print(f"{key} — {count} পাতায় ছাপ")

    MANIFEST.write_text(json.dumps(seen, indent=1, sort_keys=True) + "\n", "utf-8")
    print(f"ছাপ বসল {done}টিতে, অপরিবর্তিত {skipped}টি, মোট {pages} পাতা")
    if done:
        print("একটা PDF খুলে দেখুন: ওয়াটারমার্ক পড়া যাচ্ছে, প্রিন্ট চলে, কপি বন্ধ।")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
