function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Add it to .env.local and restart the dev server.`);
  return value;
}

export const config = {
  claudeModel: () => process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
  geminiApiKey: () => required("GEMINI_API_KEY"),
  geminiImageModel: () => process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1",
  geminiTranscribeModel: () => process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-flash-latest",
  klingModel: () => process.env.KLING_MODEL || "kling-v3.0-i2v",
  klingMode: (): "std" | "pro" => (process.env.KLING_MODE === "std" ? "std" : "pro"),
  requireKling: () => {
    if (process.env.KLINGAI_API_KEY || (process.env.KLINGAI_ACCESS_KEY && process.env.KLINGAI_SECRET_KEY)) return;
    throw new Error("Missing Kling credentials. Set KLINGAI_API_KEY (or KLINGAI_ACCESS_KEY + KLINGAI_SECRET_KEY) in .env.local.");
  },
  requireAnthropic: () => {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) required("ANTHROPIC_API_KEY");
  },
};
