import { spawn } from "node:child_process";
import { readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Frame } from "./remix";

const W = 1080;
const H = 1920;
const FPS = 30;

function exec(cmd: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) =>
      reject(new Error(`Could not run ${cmd}: ${err.message}. Is it installed and on your PATH?`)),
    );
    child.on("close", (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(`${cmd} exited with ${code}: ${stderr.trim().slice(-1500)}`)),
    );
  });
}

export async function downloadVideo(url: string, dir: string): Promise<string> {
  await exec("yt-dlp", [
    "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
    "--merge-output-format", "mp4",
    "--no-playlist",
    "-o", path.join(dir, "source.%(ext)s"),
    url,
  ]);
  const file = (await readdir(dir)).find((f) => f.startsWith("source."));
  if (!file) throw new Error("yt-dlp finished but no video file was written");
  if (file !== "source.mp4") await rename(path.join(dir, file), path.join(dir, "source.mp4"));
  return "source.mp4";
}

type Probe = { durationSec: number; hasAudio: boolean };

export async function probe(file: string): Promise<Probe> {
  const out = await exec("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", file]);
  const json = JSON.parse(out) as { format: { duration: string }; streams: { codec_type: string }[] };
  return {
    durationSec: Number(json.format.duration),
    hasAudio: json.streams.some((s) => s.codec_type === "audio"),
  };
}

export function frameTimes(durationSec: number): number[] {
  const hook = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4].filter((t) => t < durationSec);
  const rest: number[] = [];
  const restStart = 5;
  const restCount = 8;
  if (durationSec > restStart + 1) {
    const step = (durationSec - restStart) / restCount;
    for (let i = 0; i < restCount; i++) rest.push(Number((restStart + i * step).toFixed(2)));
  }
  return [...hook, ...rest];
}

export async function extractFrames(video: string, dir: string, durationSec: number): Promise<Frame[]> {
  const frames: Frame[] = [];
  for (const [i, t] of frameTimes(durationSec).entries()) {
    const file = `frame-${String(i).padStart(2, "0")}.jpg`;
    await exec("ffmpeg", ["-y", "-ss", String(t), "-i", video, "-frames:v", "1", "-vf", "scale=540:-2", "-q:v", "4", path.join(dir, file)]);
    frames.push({ file, t });
  }
  return frames;
}

export async function extractAudio(video: string, dir: string): Promise<string> {
  const file = "source-audio.mp3";
  await exec("ffmpeg", ["-y", "-i", video, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", path.join(dir, file)]);
  return file;
}

function assTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = (sec % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${s}`;
}

export function hookTextAss(text: string, durationSec: number): string {
  const escaped = text.replace(/[{}]/g, "").replace(/\r?\n/g, "\\N");
  return `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hook,Arial,76,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,6,0,8,90,90,380,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,${assTime(0)},${assTime(durationSec)},Hook,,0,0,0,,${escaped}
`;
}

const NORMALIZE = `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,fps=${FPS},setsar=1,format=yuv420p`;

async function normalizeSegment(dir: string, input: string, output: string, extraFilter?: string): Promise<void> {
  const { durationSec, hasAudio } = await probe(path.join(dir, input));
  const vf = extraFilter ? `${NORMALIZE},${extraFilter}` : NORMALIZE;
  const silence = ["-f", "lavfi", "-t", String(durationSec), "-i", "anullsrc=r=44100:cl=stereo"];
  await exec("ffmpeg", [
    "-y", "-i", input, ...(hasAudio ? [] : silence),
    "-map", "0:v:0", "-map", hasAudio ? "0:a:0" : "1:a:0",
    "-vf", vf,
    "-af", "apad",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-c:a", "aac", "-ar", "44100", "-ac", "2", "-b:a", "160k",
    "-shortest",
    output,
  ], dir);
}

export async function assemble(opts: { dir: string; hook: string; demo: string; hookText: string }): Promise<string> {
  const { dir } = opts;
  const hookIn = path.join(dir, opts.hook);
  const { durationSec } = await probe(hookIn);
  await writeFile(path.join(dir, "hook.ass"), hookTextAss(opts.hookText, durationSec));
  await normalizeSegment(dir, opts.hook, "seg-hook.mp4", "subtitles=hook.ass");
  await normalizeSegment(dir, opts.demo, "seg-demo.mp4");
  const file = "final.mp4";
  await exec("ffmpeg", [
    "-y", "-i", "seg-hook.mp4", "-i", "seg-demo.mp4",
    "-filter_complex", "[0:v][0:a][1:v][1:a]concat=n=2:v=1:a=1[v][a]",
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-c:a", "aac", "-b:a", "160k",
    "-movflags", "+faststart",
    file,
  ], dir);
  return file;
}
