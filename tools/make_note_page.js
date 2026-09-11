// book_notes/<id>.html -> book_notes/<id>.png, ঠিক বইয়ের পাতার মাপে।
//
//     node tools/make_note_page.js isme-azam
//
// পেইড বইয়ের ভেতরে রাকীর সম্পাদকীয় টীকা একটা পাতা হিসেবে বসে, আর বইয়ের বাকি
// সব পাতাই ছবি — তাই টীকাটিও ছবি হতে হয়। বাংলা লেখা headless Chrome-এ রেন্ডার
// করা হয়: PDF/ইমেজ লাইব্রেরিগুলো যুক্তাক্ষর ঠিকমতো জোড়ে না, আর ভাঙা যুক্তাক্ষর
// ছাপা বইয়ে ধরা পড়ে না — বিক্রির পর ক্রেতার চোখে পড়ে।
//
// রেন্ডারের পর পাতা উপচে পড়েছে কি না নিজেই দেখে নেয় (scrollHeight), কারণ
// লেখা একটু বাড়লেই নিচের অংশ নীরবে কেটে যায়।

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const W = 1200, H = 1553;   // book_pages_*/ এর পাতার মাপ

const CHROME = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
].find((p) => p && fs.existsSync(p));

(async () => {
    const id = process.argv[2];
    if (!id) { console.error('ব্যবহার: node tools/make_note_page.js <book-id>'); process.exit(1); }
    if (!CHROME) { console.error('Chrome পাওয়া যায়নি।'); process.exit(1); }

    const src = path.join(ROOT, 'book_notes', `${id}.html`);
    const out = path.join(ROOT, 'book_notes', `${id}.png`);
    if (!fs.existsSync(src)) { console.error(`নেই: ${src}`); process.exit(1); }

    const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.goto('file:///' + src.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);

    const overflow = await page.evaluate(() => ({
        scroll: document.body.scrollHeight,
        client: document.documentElement.clientHeight,
    }));
    if (overflow.scroll > overflow.client + 1) {
        await browser.close();
        console.error(`লেখা পাতায় ধরেনি: ${overflow.scroll}px > ${overflow.client}px। `
            + 'লেখা ছোট করুন বা ফন্ট সাইজ কমান — কিছু লেখা হয়নি।');
        process.exit(1);
    }

    await page.screenshot({ path: out, clip: { x: 0, y: 0, width: W, height: H } });
    await browser.close();
    console.log(`${path.relative(ROOT, out)} — ${W}x${H}, লেখা ${overflow.scroll}px (সীমা ${overflow.client}px)`);
    console.log('চোখে দেখে নিন: যুক্তাক্ষর ভাঙেনি তো?');
})();
