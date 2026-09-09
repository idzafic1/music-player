# Audio Quality & Fetching Improvements

This document specifies enhancements to maximize audio fidelity, volume consistency, and stream performance across the personal music player.

---

## 1. Optimal Stream Selection & Extraction

### yt-dlp Format Selection
YouTube stores audio in multiple codecs and bitrates:
- **Opus (`audio/webm`)**: Typically up to 160 kbps VBR (format 251). Superior acoustic transparency compared to AAC at identical bitrates.
- **AAC (`audio/mp4`)**: Typically 128 kbps CBR (format 140). Maximum native hardware decoding support on older mobile hardware.

#### Recommended Extraction Strategy
Instead of blindly requesting m4a, select the absolute highest-fidelity audio stream available, then transcode if needed:
```bash
yt-dlp \
  --js-runtimes node:node \
  -f "bestaudio[ext=m4a]/bestaudio/best" \
  --audio-format m4a \
  --audio-quality 0 \
  --extract-audio \
  ...
```
- `--audio-quality 0`: instruct ffmpeg to use highest available VBR quality setting (`q:a 0` or 256kbps+ VBR).
- For audiophile-grade setups, allow optional Opus container (`.opus`) or ALAC/FLAC when source permits.

---

## 2. Loudness Normalization (EBU R128 / loudnorm)

### The Problem
YouTube uploads have drastically different mastered volumes (from quiet acoustic recordings to compressed modern masters). Listening across a playlist causes jarring volume shifts.

### The Solution: 2-Pass or 1-Pass ffmpeg `loudnorm`
Apply the broadcast-standard **EBU R128 loudness normalization** during the post-processing phase:
```bash
ffmpeg -i input.webm -af "loudnorm=I=-16:TP=-1.5:LRA=11" -c:a aac -b:a 256k output.m4a
```
- `I=-16`: Integrated loudness target (-16 LUFS is ideal for mobile headphones; YouTube standard is -14 LUFS).
- `TP=-1.5`: True peak limit to prevent digital clipping / distortion.
- `LRA=11`: Loudness range target to preserve dynamic musical expression.

### Non-Destructive Alternative: ReplayGain Metadata
If transcoding avoidance is desired, measure track loudness with `ffmpeg -filter:a ebur128` and store the ReplayGain tag in SQLite (`songs.replay_gain_db`), applying gain in the frontend `Audio` / track-player volume node dynamically.

---

## 3. High-Resolution Artwork & Tag Enrichment

### Artwork Standardization
1. YouTube thumbnails are often 16:9 (`hq720.jpg` or `maxresdefault.jpg`) with black letterbox bars or off-center subjects.
2. The downloader pipeline should:
   - Request max-res thumbnail: `--write-thumbnail --embed-thumbnail`.
   - Scale and crop to perfect 500x500 or 800x800 square:
     ```bash
     ffmpeg -y -i raw_thumb.webp -vf "crop='min(iw,ih)':'min(iw,ih)',scale=600:600" thumb.jpg
     ```
3. Embed the square JPEG directly into the audio file container via `mutagen` or `node-id3`.

### Metadata Enrichment
- Strip channel suffixes like `" - Topic"`, `"VEVO"`, `"(Official Audio)"`, `"[HQ]"`.
- Parse track number, release year (`meta.release_year` or `meta.upload_date`), and genre tags.

---

## 4. HTTP Range & Caching Optimizations

### Streaming Performance
In `backend/src/services/streaming.ts`:
1. **ETag Support**: Generate an `ETag: W/"<size>-<mtime>"` header. When the client sends `If-None-Match`, respond with `304 Not Modified` to prevent unnecessary re-transmissions.
2. **Aggressive Browser Caching**:
   ```typescript
   reply.header('Cache-Control', 'public, max-age=31536000, immutable');
   ```
   Audio files are immutable once downloaded by ID; caching them indefinitely reduces server disk I/O and zero-latency seeking.
3. **Optimized Stream Buffer**: Configure `highWaterMark: 256 * 1024` (256 KB) on `fs.createReadStream` to maintain smoother throughput over slower Wi-Fi or mobile data.
