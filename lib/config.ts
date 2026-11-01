function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Add it to .env.local and restart the dev server.`);
  return value;
}

export const config = {
  planner: (): "gemini" | "claude" => (process.env.PLANNER === "claude" ? "claude" : "gemini"),
  claudeModel: () => process.env.CLAUDE_MODEL || "claude-sonnet-5-5",
  geminiApiKey: () => required("GEMINI_API_KEY"),
  geminiTextModel: () => process.env.GEMINI_TEXT_MODEL || "gemini-flash-latest",
  geminiImageModel: () => process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1",
  geminiVideoModel: () => process.env.GEMINI_VIDEO_MODEL || "gemini-omni-1.1-flash",
  requireAnthropic: () => {
    if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) required("ANTHROPIC_API_KEY");
  },
};
