import os
import sys
import json
import re
import time
import io
from google import genai
from google.genai import errors
from PIL import Image
import pypdfium2 as pdfium
import docx
from docx import Document
from docx.shared import Pt, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

# Ensure console output handles UTF-8
sys.stdout.reconfigure(encoding='utf-8')

# Constants
PDF_DIR = r"A:\Ruqyah Audio App\pdf"
OUTPUT_DIR = r"A:\Ruqyah Audio App\docx"
PROGRESS_FILE = r"A:\Ruqyah Audio App\conversion_progress.json"

# Check/Create directories
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Helper function to set RTL on a paragraph
def set_rtl(paragraph):
    pPr = paragraph._p.get_or_add_pPr()
    bidi = OxmlElement('w:bidi')
    bidi.set(qn('w:val'), '1')
    pPr.append(bidi)

# Helper function to detect Arabic text
def contains_arabic(text):
    # Matches Arabic Unicode range
    return bool(re.search(r'[\u0600-\u06FF]', text))

# Parse Markdown lines and write to Word document
def markdown_to_docx(md_content, doc):
    lines = md_content.split('\n')
    for line in lines:
        line_str = line.strip()
        if not line_str:
            continue
        
        # Headings
        if line_str.startswith('# '):
            p = doc.add_paragraph()
            run = p.add_run(line_str[2:])
            run.font.size = Pt(20)
            run.bold = True
            run.font.name = 'Hind Siliguri'
            p.paragraph_format.space_before = Pt(12)
            p.paragraph_format.space_after = Pt(6)
            continue
        elif line_str.startswith('## '):
            p = doc.add_paragraph()
            run = p.add_run(line_str[3:])
            run.font.size = Pt(16)
            run.bold = True
            run.font.name = 'Hind Siliguri'
            p.paragraph_format.space_before = Pt(10)
            p.paragraph_format.space_after = Pt(4)
            continue
        elif line_str.startswith('### '):
            p = doc.add_paragraph()
            run = p.add_run(line_str[4:])
            run.font.size = Pt(14)
            run.bold = True
            run.font.name = 'Hind Siliguri'
            p.paragraph_format.space_before = Pt(8)
            p.paragraph_format.space_after = Pt(4)
            continue
        
        # Bullet lists
        is_bullet = False
        if line_str.startswith('- ') or line_str.startswith('* '):
            is_bullet = True
            line_content = line_str[2:]
        else:
            line_content = line_str

        p = doc.add_paragraph(style='List Bullet' if is_bullet else 'Normal')
        p.paragraph_format.space_after = Pt(6)
        p.paragraph_format.line_spacing = 1.15
        
        # Parse inline formatting (bold: **, italic: *)
        # Split by ** for bold detection
        parts = re.split(r'(\*\*.*?\*\*)', line_content)
        for part in parts:
            if part.startswith('**') and part.endswith('**'):
                text_chunk = part[2:-2]
                bold_chunk = True
            else:
                text_chunk = part
                bold_chunk = False
            
            if not text_chunk:
                continue
                
            run = p.add_run(text_chunk)
            
            # Detect Arabic in chunk for RTL/font styling
            if contains_arabic(text_chunk):
                set_rtl(p)
                p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                run.font.name = 'Noto Naskh Arabic'
                run.font.size = Pt(16)
                # Keep line spacing wide for Arabic readability
                p.paragraph_format.line_spacing = 1.5
            else:
                run.font.name = 'Noto Serif Bengali'
                run.font.size = Pt(12)
                
            if bold_chunk:
                run.bold = True

def process_pdf(pdf_path, client, docx_path):
    print(f"Opening PDF: {os.path.basename(pdf_path)}")
    pdf = pdfium.PdfDocument(pdf_path)
    doc = Document()
    
    # Configure default style margins
    sections = doc.sections
    for section in sections:
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1)
        section.right_margin = Inches(1)

    total_pages = len(pdf)
    print(f"Total pages to OCR: {total_pages}")
    
    for page_idx in range(total_pages):
        print(f"  Processing page {page_idx + 1}/{total_pages}...")
        page = pdf[page_idx]
        
        # Render to PIL Image
        bitmap = page.render(scale=2)  # scale up for better OCR accuracy
        pil_img = bitmap.to_pil()
        
        # Save PIL image to bytes
        img_byte_arr = io.BytesIO()
        pil_img.save(img_byte_arr, format='PNG')
        img_bytes = img_byte_arr.getvalue()
        
        # Use Gemini API to OCR the page image
        prompt = (
            "Perform OCR on this page image. The document contains Bengali, Arabic, and English text.\n"
            "Output the transcription formatted in Markdown, preserving headers, paragraph structures, lists, and bold text.\n"
            "For Arabic texts (Quranic verses/Duas), keep them complete and verbatim. Output ONLY the markdown text, do not explain or add commentary."
        )
        
        # Request generation with retry mechanism for rate limits (429)
        max_retries = 10
        retry_delay = 30
        for attempt in range(max_retries):
            try:
                response = client.models.generate_content(
                    model='gemini-3.5-flash',
                    contents=[
                        {"inline_data": {"mime_type": "image/png", "data": img_bytes}},
                        prompt
                    ]
                )
                page_md = response.text
                break
            except Exception as e:
                err_msg = str(e)
                if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg:
                    print(f"    Rate limit hit (429). Retrying in {retry_delay}s (Attempt {attempt+1}/{max_retries})...")
                    time.sleep(retry_delay)
                    retry_delay = min(retry_delay * 2, 120)  # Exponential backoff up to 2 mins
                else:
                    raise e
        else:
            raise Exception("Failed to process page due to persistent API rate limits.")
        # Write to document
        markdown_to_docx(page_md, doc)
        
        # Add page break between pages
        if page_idx < total_pages - 1:
            doc.add_page_break()
            
        time.sleep(1) # Simple rate-limit cooling
        
    doc.save(docx_path)
    print(f"Successfully saved: {docx_path}")

def load_progress():
    if os.path.exists(PROGRESS_FILE):
        try:
            with open(PROGRESS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_progress(progress):
    try:
        with open(PROGRESS_FILE, 'w', encoding='utf-8') as f:
            json.dump(progress, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving progress: {e}")

def main():
    # Retrieve API key
    api_key = os.environ.get('GEMINI_API_KEY', '').strip()
    if not api_key:
        print("❌ Error: GEMINI_API_KEY environment variable is missing or empty!")
        sys.exit(1)
        
    print("Initializing Gemini Client...")
    client = genai.Client(api_key=api_key)
    
    # Test connection
    print("Testing API connection...")
    for attempt in range(50):
        try:
            client.models.generate_content(model='gemini-3.5-flash', contents='Ping')
            print("✅ Gemini API connection validated.")
            break
        except Exception as e:
            err_msg = str(e)
            if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg:
                print(f"  Startup check rate limited. Retrying in 15s (Attempt {attempt+1}/50)...")
                time.sleep(15)
            else:
                print(f"❌ Gemini API Key check failed: {e}")
                sys.exit(1)
    else:
        print("❌ Startup test failed due to persistent rate limiting.")
        sys.exit(1)

    progress = load_progress()
    
    pdf_files = [f for f in os.listdir(PDF_DIR) if f.lower().endswith('.pdf')]
    pdf_files.sort()
    
    total_files = len(pdf_files)
    print(f"Found {total_files} PDFs to process.")
    
    for idx, f in enumerate(pdf_files, 1):
        if progress.get(f) == "completed":
            print(f"[{idx}/{total_files}] Skipping {f} (already processed).")
            continue
            
        pdf_path = os.path.join(PDF_DIR, f)
        docx_filename = os.path.splitext(f)[0] + ".docx"
        docx_path = os.path.join(OUTPUT_DIR, docx_filename)
        
        print(f"\n[{idx}/{total_files}] Processing {f}...")
        try:
            process_pdf(pdf_path, client, docx_path)
            progress[f] = "completed"
            save_progress(progress)
        except Exception as e:
            print(f"❌ Failed to process {f}: {e}")
            # Do not raise, allow moving to next file, but print error details
            
    print("\n🎉 Process complete!")

if __name__ == "__main__":
    main()
