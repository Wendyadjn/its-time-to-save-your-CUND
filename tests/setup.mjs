import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const directory = mkdtempSync(join(tmpdir(), "canto-test-usage-"));
process.env.SERVICE_DATA_DIR = directory;
for (const key of ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "AI_PROVIDER", "GROQ_API_KEY", "SILICONFLOW_API_KEY", "ONDOKU_TOKEN", "DAILY_TRANSLATE_LIMIT", "DAILY_TRANSCRIBE_LIMIT", "DAILY_TTS_LIMIT", "DAILY_TTS_CHARACTER_LIMIT"]) delete process.env[key];
process.on("exit", () => rmSync(directory, { recursive: true, force: true }));
