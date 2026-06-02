import json
import subprocess
import os

def get_all_videos():
    yt_dlp_path = r"C:\Users\faisa\AppData\Roaming\Python\Python314\Scripts\yt-dlp.exe"
    command = [
        yt_dlp_path,
        "--flat-playlist",
        "https://www.youtube.com/@fawaz_alaswad/videos",
        "--print", "%(title)s|||%(id)s"
    ]
    result = subprocess.run(command, capture_output=True, text=False)
    if result.returncode != 0:
        return []
    stdout_text = result.stdout.decode('utf-8', errors='replace')
    videos = []
    for line in stdout_text.strip().split('\n'):
        if "|||" in line:
            title, yt_id = line.split("|||")
            videos.append({"title_ar": title, "youtube_id": yt_id})
    return videos

if __name__ == "__main__":
    videos = get_all_videos()
    with open('all_videos_correct.json', 'w', encoding='utf-8') as f:
        json.dump(videos, f, ensure_ascii=False, indent=2)
