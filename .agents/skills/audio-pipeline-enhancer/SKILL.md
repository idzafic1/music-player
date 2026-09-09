---
name: audio-pipeline-enhancer
description: >-
  Use this skill when tasked with improving audio quality, loudness normalization,
  high-res album artwork processing, or HTTP streaming throughput in the music player.
---

# Audio Pipeline Enhancer Skill

This skill guides the agent in optimizing audio extraction, applying EBU R128 loudness normalization, and fine-tuning streaming performance.

## Core Procedures

1. **Format Selection in yt-dlp**:
   - Inspect `backend/src/services/downloader.ts`.
   - Ensure the selector uses `-f "bestaudio[ext=m4a]/bestaudio/best"` and `--audio-quality 0`.
   - Pass `--extract-audio --audio-format m4a`.

2. **Loudness Normalization with ffmpeg**:
   - In the download post-processing stage, pass the audio through ffmpeg's `loudnorm` filter:
     ```bash
     ffmpeg -i input.m4a -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:a aac -b:a 256k output.m4a
     ```
   - This ensures uniform volume without clipping.

3. **Square Album Artwork Processing**:
   - Crop downloaded thumbnails to 1:1 aspect ratio with centered focus:
     ```bash
     ffmpeg -y -i raw_thumb -vf "crop='min(iw,ih)':'min(iw,ih)',scale=600:600" thumb.jpg
     ```

4. **HTTP Range & Cache Headers**:
   - In `backend/src/services/streaming.ts`:
     - Add `Cache-Control: public, max-age=31536000, immutable`.
     - Add `ETag: W/"<size>-<mtime>"`.
     - Handle `If-None-Match` returning `304 Not Modified`.
