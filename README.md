# Remix Studio

A personal, local version of the Yorby workflow. Paste a TikTok or Instagram "hook + demo" video that is already working for someone else. The app remakes the hook for your product with an AI avatar and joins it to your own demo recording.

1. **Ingest.** yt-dlp downloads the video. FFmpeg samples 16 frames (dense over the first 4 seconds, where the hook is) and extracts the audio.
2. **Plan.** Gemini transcribes the audio. Claude reads the frames and transcript, analyzes why the hook works, and writes a script for your product: on-screen hook text with alternatives, an avatar prompt, a motion prompt, the hook length, a caption and hashtags.
3. **Review.** The pipeline stops here. Edit anything in the script, then press **Generate video**. Nothing paid for image or video generation runs before this.
4. **Avatar.** Nano Banana generates the opening frame. It uses your creator photo for the face if you gave one, and a frame from the original for composition only.
5. **Hook.** Kling 3.0 animates the frame into a silent 3–10 second clip.
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

Keys in `.env.local`:

| Variable | Where to get it |
| --- | --- |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `GEMINI_API_KEY` | aistudio.google.com/apikey. Used for Nano Banana and for transcription. |
| `KLINGAI_API_KEY` | kling.ai/dev/api-key. Older accounts can set `KLINGAI_ACCESS_KEY` and `KLINGAI_SECRET_KEY` instead. |

Optional overrides: `CLAUDE_MODEL` (default `claude-sonnet-5-5`), `GEMINI_IMAGE_MODEL` (default `gemini-nano-banana-2.1`), `GEMINI_TRANSCRIBE_MODEL` (default `gemini-flash-latest`), `KLING_MODEL` (default `kling-v3.0-i2v`), and `KLING_MODE` (`pro` by default, `std` is cheaper).

## Notes

- TikTok and Instagram sometimes block yt-dlp. Update it with `brew upgrade yt-dlp`, or use **Upload the video file instead** on the form.
- The hook is silent on purpose. Add a trending sound in the TikTok or Instagram editor when you post; that also helps reach.
- Steps run inside the dev server process. If you stop the server mid-step, that step shows as interrupted, and **Retry** picks it up again.
- Run `npm run typecheck` after changes.
