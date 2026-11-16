# Remix Studio

A personal, local version of the Yorby workflow. Paste a TikTok or Instagram "hook + demo" video that is already working for someone else. The app remakes the hook for your product with an AI avatar and joins it to your own demo recording.

1. **Ingest.** yt-dlp downloads the video. FFmpeg samples 16 frames (dense over the first 4 seconds, where the hook is) and extracts the audio.
2. **Plan.** Gemini watches the whole video, sound included, analyzes why the hook works, and writes a script for your product: on-screen hook text with alternatives, an avatar prompt, a motion prompt, the hook length, a caption and hashtags. Set `PLANNER=claude` to have Claude write it from the frames and a transcript instead.
3. **Review.** The pipeline stops here. Edit anything in the script, then press **Generate video**. Nothing paid for image or video generation runs before this.
4. **Avatar.** Nano Banana runs twice. It first removes the person and the overlaid text from a frame of the original hook, leaving the empty scene. It then places a new person into that scene in the original pose, expression and clothing: your creator photo if you gave one, otherwise a clearly different fictional adult. Asking it to swap the person directly is treated as a face swap and blocked. The image costs about $0.10 because of the two passes.
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

On this Windows PC, Node and FFmpeg are installed and yt-dlp is in `.local/bin`.
Run `Start-RemixStudio.cmd` to start the app at http://127.0.0.1:3000.
The launcher adds the local yt-dlp folder to PATH for the app. Close its terminal
or press Ctrl+C to stop a foreground session. Use `npm.cmd` for npm commands in
PowerShell, where the script execution policy blocks `npm.ps1`.

The local `.env.local` file has been created from `.env.example`. Add your
`GEMINI_API_KEY` there before generating a remix, then restart the app.

One Google key runs everything. Create it at aistudio.google.com/apikey and put it in `.env.local` as `GEMINI_API_KEY`.

A Google AI Pro subscription includes $10 a month of Google Cloud credits that pay for the Gemini API. Turn them on once in the Google Developer Program (My Benefits page) and link them to your AI Studio billing account. At list prices one remix costs about $0.55 (a $0.05 Nano Banana image and about $0.10 per second of Omni Flash video), so the credits cover roughly 15 to 18 remixes a month.

Optional settings: `PLANNER=claude` with `ANTHROPIC_API_KEY` (about $0.04 per script with `claude-sonnet-5-5`), and model overrides `GEMINI_TEXT_MODEL` (default `gemini-flash-latest`), `GEMINI_IMAGE_MODEL` (default `gemini-nano-banana-2.1`) and `GEMINI_VIDEO_MODEL` (default `gemini-omni-1.1-flash`).

## Ad Studio (static Meta ads)

Open **Ad Studio** in the top bar (`/ads`). It makes static image ads for MandaFoto (or any brand you set up) in Brazilian Portuguese.

1. **Brand profile.** Product description, audiences, tone, colors, fonts, logo, real product screenshots and brand photos. **Verified features** and **verified pricing** are the only claims concepts may make. Pricing starts empty, so ads never mention price until you fill it in.
2. **References.** Upload screenshots of ads you collected yourself. Nothing is scraped from the Meta Ad Library. Gemini describes the hook, headline, composition, emotional appeal, value proposition, CTA and buyer-awareness stage, plus a hypothesis about why it *may* work. A screenshot cannot show results, so performance is never claimed. Only this written analysis informs concepts. Reference images are never sent to the image model.
3. **Concepts.** Create a project in the sidebar and generate 1 or 6 concepts. Each one has an ID, title, angle, hook, visual, primary text, headline, CTA and a hypothesis to test. Edit them, then **Approve**. The server refuses image generation for concepts that are not approved. Copy is scanned for numbers, prices, discounts, testimonials and superlatives that aren't in your verified facts.
4. **Images.** Nano Banana (`GEMINI_IMAGE_MODEL`) makes text-free photo backgrounds in 4:5, 9:16 or 1:1, optionally using your brand photos or screenshots as references. Every prompt forbids text, logos and UI. Generate as many versions as you like and pick one. Each format uses a version in its own aspect ratio when one exists.
5. **Editor & export.** HTML/CSS templates (full-bleed photo, photo + color panel, product screenshot in a phone frame) compose the headline, supporting copy, logo and CTA as real text. The preview is the same HTML that Playwright renders to PNG: Feed 1080×1350, Stories 1080×1920 (text kept out of the Stories UI zones) and Square 1080×1080. Each PNG gets a JSON file with the concept ID, angle, audience, copy, variant, template and image prompt.
6. **Library.** Every export, filterable by audience, angle, format and project.

Everything is saved under `data/ads/` (`brand.json`, `assets/`, `references/`, `projects/<id>/images|exports`).

Rendering uses `playwright-core` with Playwright's Chromium. Install it once with `npx playwright-core install chromium` (on Windows PowerShell, `npx.cmd`). If that's missing, the app falls back to Microsoft Edge.

**Mock mode.** Set `ADS_MOCK=1` in `.env.local`, or leave `GEMINI_API_KEY` empty, and concepts, analyses and backgrounds become placeholders, so you can try the whole flow without spending credits. Exports still render real PNGs. The sidebar shows whether you are in mock mode or live. Gemini calls retry with backoff on rate limits, 5xx and network errors. A blocked or empty image is shown to you instead of retried.

## Notes

- TikTok and Instagram sometimes block yt-dlp. Update it with `brew upgrade yt-dlp`, or use **Upload the video file instead** on the form.
- The hook is muted and trimmed to the script's length on purpose. Add a trending sound in the TikTok or Instagram editor when you post; that also helps reach.
- Steps run inside the dev server process. If you stop the server mid-step, that step shows as interrupted, and **Retry** picks it up again.
- Run `npm run typecheck` after changes.
