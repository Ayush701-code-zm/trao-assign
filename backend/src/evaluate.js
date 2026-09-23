#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { runPipeline, toPublicKit } from './pipeline/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input') out.input = argv[++i];
    else if (argv[i] === '--output') out.output = argv[++i];
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input || !args.output) {
    console.error('Usage: npm run evaluate -- --input <cases.json> --output <kits.json>');
    process.exit(1);
  }

  if (!config.llm.groqApiKey && !config.llm.geminiApiKey) {
    console.error('Set GROQ_API_KEY or GEMINI_API_KEY in the environment (see .env.example)');
    process.exit(1);
  }

  // Batch evaluate often targets local fixture sites
  process.env.ALLOW_PRIVATE_URLS = process.env.ALLOW_PRIVATE_URLS || 'true';

  const inputPath = path.resolve(process.cwd(), args.input);
  const outputPath = path.resolve(process.cwd(), args.output);
  const cases = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

  if (!Array.isArray(cases)) {
    console.error('Input must be a JSON array of cases');
    process.exit(1);
  }

  const results = [];
  const started = Date.now();

  for (const c of cases) {
    const id = c.id || `case-${results.length + 1}`;
    process.stderr.write(`\n→ ${id} … `);
    try {
      const kit = await runPipeline({
        jd: c.jd,
        company_url: c.company_url,
        days: c.days,
      });
      results.push({
        id,
        status: 'ok',
        kit: toPublicKit(kit),
        error: null,
      });
      process.stderr.write('ok\n');
    } catch (err) {
      results.push({
        id,
        status: 'failed',
        kit: null,
        error: {
          code: err.code || 'GENERATION_FAILED',
          message: err.message || 'Unknown error',
        },
      });
      process.stderr.write(`failed (${err.message})\n`);
    }
  }

  const payload = {
    version: '1.0',
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    kits: results,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.error(`Wrote ${results.length} kits to ${outputPath} in ${secs}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
