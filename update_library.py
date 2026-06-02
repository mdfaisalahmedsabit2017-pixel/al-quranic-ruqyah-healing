import json
import subprocess
import os
import sys

# Configuration
CHANNEL_URL = "https://www.youtube.com/@fawaz_alaswad/videos"
AUDIO_JSON_PATH = "audio.json"

def get_channel_videos():
    # Using the full path to yt-dlp.exe
    yt_dlp_path = r"C:\Users\faisa\AppData\Roaming\Python\Python314\Scripts\yt-dlp.exe"
    
    command = [
        yt_dlp_path,
        "--flat-playlist",
        CHANNEL_URL,
        "--print", "%(title)s|||%(id)s"
    ]
    
    result = subprocess.run(command, capture_output=True, text=False)
    if result.returncode != 0:
        return []
    
    try:
        stdout_text = result.stdout.decode('utf-8', errors='replace')
    except Exception:
        return []

    videos = []
    for line in stdout_text.strip().split('\n'):
        if "|||" in line:
            title, yt_id = line.split("|||")
            videos.append({"title_ar": title, "youtube_id": yt_id})
    return videos

def update_audio_json(as_json=False):
    # Load existing data
    if os.path.exists(AUDIO_JSON_PATH):
        with open(AUDIO_JSON_PATH, 'r', encoding='utf-8') as f:
            existing_data = json.load(f)
    else:
        existing_data = []

    existing_ids = {item.get('youtube_id') or (item.get('url', '').split('v=')[-1] if 'v=' in item.get('url', '') else '') for item in existing_data}
    existing_ids.discard('')

    new_videos = get_channel_videos()
    
    # Filter out already existing videos
    to_add = [v for v in new_videos if v['youtube_id'] not in existing_ids]
    
    if as_json:
        # Use sys.stdout.buffer to write UTF-8 bytes directly
        output = json.dumps(to_add, ensure_ascii=False).encode('utf-8')
        sys.stdout.buffer.write(output)
        sys.stdout.buffer.flush()
    else:
        if not to_add:
            print("✅ No new videos found. Library is up to date.")
            return
        print(f"🆕 Found {len(to_add)} new videos.")
        print("-" * 30)
        for v in to_add:
            try:
                print(f"{v['title_ar']} ||| {v['youtube_id']}")
            except UnicodeEncodeError:
                print(f"{v['title_ar'].encode('ascii', 'replace').decode()} ||| {v['youtube_id']}")
        print("-" * 30)
        print("Please use Gemini CLI to categorize the above list.")

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--json":
        update_audio_json(as_json=True)
    else:
        update_audio_json(as_json=False)
