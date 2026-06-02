import json

def compare():
    try:
        with open('audio.json', 'r', encoding='utf-8') as f:
            audio = json.load(f)
        with open('all_videos_correct.json', 'r', encoding='utf-8') as f:
            all_videos = json.load(f)

        existing_ids = set()
        for item in audio:
            if 'url' in item and 'v=' in item['url']:
                existing_ids.add(item['url'].split('v=')[1].split('&')[0])
            elif 'youtube_id' in item:
                existing_ids.add(item['youtube_id'])

        new_videos = [v for v in all_videos if v['youtube_id'] not in existing_ids]

        print(f"Total in all_videos: {len(all_videos)}")
        print(f"Total in audio.json: {len(audio)}")
        print(f"New videos count: {len(new_videos)}")

        # Print the first 10 new videos to see their titles
        for i, v in enumerate(new_videos[:10]):
            print(f"{i+1}. ID: {v['youtube_id']} Title: {v['title_ar']}")
            
        return new_videos
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    compare()
