import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/interview-prep',
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  allowPrivateUrls:
    process.env.ALLOW_PRIVATE_URLS === 'true' ||
    process.env.NODE_ENV !== 'production',
  llm: {
    provider: (process.env.LLM_PROVIDER || 'groq').toLowerCase(),
    groqApiKey: process.env.GROQ_API_KEY || '',
    groqModel: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    maxRetries: Number(process.env.LLM_MAX_RETRIES || 5),
    retryBaseMs: Number(process.env.LLM_RETRY_BASE_MS || 2000),
  },
  crawl: {
    delayMs: Number(process.env.CRAWL_DELAY_MS || 400),
    maxPages: Number(process.env.CRAWL_MAX_PAGES || 12),
    maxBytes: 1_500_000,
    timeoutMs: 12_000,
  },
};
