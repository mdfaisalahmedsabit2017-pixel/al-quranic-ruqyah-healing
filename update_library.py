import json
import subprocess
import os

# Configuration
CHANNEL_URL = "https://www.youtube.com/@fawaz_alaswad/videos"
AUDIO_JSON_PATH = "audio.json"
TEMP_VIDEOS_FILE = "videos_raw.txt"

def get_channel_videos():
    print("📡 Extracting videos from YouTube channel...")
    # Using the full path to yt-dlp.exe based on the previous install log
    yt_dlp_path = r"C:\Users\faisa\AppData\Roaming\Python\Python314\Scripts\yt-dlp.exe"
    
    command = [
        yt_dlp_path,
        "--flat-playlist",
        CHANNEL_URL,
        "--print", "%(title)s|||%(id)s"
    ]
    
    result = subprocess.run(command, capture_output=True, text=True, encoding='utf-8')
    if result.returncode != 0:
        print(f"❌ Error extracting videos: {result.stderr}")
        return []
    
    videos = []
    for line in result.stdout.strip().split('\n'):
        if "|||" in line:
            title, yt_id = line.split("|||")
            videos.append({"title_ar": title, "youtube_id": yt_id})
    return videos

def update_audio_json():
    # Load existing data
    if os.path.exists(AUDIO_JSON_PATH):
        with open(AUDIO_JSON_PATH, 'r', encoding='utf-8') as f:
            existing_data = json.load(f)
    else:
        existing_data = []

    existing_ids = {item.get('youtube_id') or item.get('url').split('v=')[-1] for item in existing_data}
    
    new_videos = get_channel_videos()
    
    # Filter out already existing videos
    to_add = [v for v in new_videos if v['youtube_id'] not in existing_ids]
    
    if not to_add:
        print("✅ No new videos found. Library is up to date.")
        return

    print(f"🆕 Found {len(to_add)} new videos.")
    print("🤖 Step for manual Gemini categorization:")
    print("-" * 30)
    for v in to_add:
        print(f"{v['title_ar']} ||| {v['youtube_id']}")
    print("-" * 30)
    print("Please use Gemini CLI to categorize the above list and then manually append to audio.json.")

if __name__ == "__main__":
    update_audio_json()
