# Remix Studio

A personal, local version of the Yorby workflow. Paste a TikTok or Instagram "hook + demo" video that is already working for someone else. The app remakes the hook for your product with an AI avatar and joins it to your own demo recording.

1. **Ingest.** yt-dlp downloads the video. FFmpeg samples 16 frames (dense over the first 4 seconds, where the hook is) and extracts the audio.
2. **Plan.** Gemini watches the whole video, sound included, analyzes why the hook works, and writes a script for your product: on-screen hook text with alternatives, an avatar prompt, a motion prompt, the hook length, a caption and hashtags. Set `PLANNER=claude` to have Claude write it from the frames and a transcript instead.
3. **Review.** The pipeline stops here. Edit anything in the script, then press **Generate video**. Nothing paid for image or video generation runs before this.
4. **Avatar.** Nano Banana generates the opening frame. It uses your creator photo for the face if you gave one, and a frame from the original for composition only.
5. **Hook.** Gemini Omni Flash animates the frame into a 3–10 second clip. Its sound is muted.
6. **Assemble.** FFmpeg scales both clips to 1080×1920 at 30 fps, burns the hook text in TikTok style, and joins the hook to your demo as `final.mp4`.

Each step can be re-run on its own from the remix page: **New avatar**, **Re-animate hook**, and **Re-stitch with new text** (after editing the hook text). Every remix is a folder under `data/remixes/`, and the home page lists them as your library.

## Setup

You need Node 20+, `ffmpeg` and `yt-dlp` on your PATH.

```bash
brew install ffmpeg yt-dlp      # macOS
npm install
cp .env.example .env.local      # then fill in the keys
npm run dev                     # http://localhost:3000
```

One Google key runs everything. Create it at aistudio.google.com/apikey and put it in `.env.local` as `GEMINI_API_KEY`.

A Google AI Pro subscription includes $10 a month of Google Cloud credits that pay for the Gemini API. Turn them on once in the Google Developer Program (My Benefits page) and link them to your AI Studio billing account. At list prices one remix costs about $0.55 (a $0.05 Nano Banana image and about $0.10 per second of Omni Flash video), so the credits cover roughly 15 to 18 remixes a month.

Optional settings: `PLANNER=claude` with `ANTHROPIC_API_KEY` (about $0.04 per script with `claude-sonnet-5-5`), and model overrides `GEMINI_TEXT_MODEL` (default `gemini-flash-latest`), `GEMINI_IMAGE_MODEL` (default `gemini-nano-banana-2.1`) and `GEMINI_VIDEO_MODEL` (default `gemini-omni-1.1-flash`).

## Notes

- TikTok and Instagram sometimes block yt-dlp. Update it with `brew upgrade yt-dlp`, or use **Upload the video file instead** on the form.
- The hook is muted and trimmed to the script's length on purpose. Add a trending sound in the TikTok or Instagram editor when you post; that also helps reach.
- Steps run inside the dev server process. If you stop the server mid-step, that step shows as interrupted, and **Retry** picks it up again.
- Run `npm run typecheck` after changes.
