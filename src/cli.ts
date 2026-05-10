#!/usr/bin/env node
import { UsageError } from './errors.js';
import { getDefaultConfig, getHelpText, loadCliConfig, parseArgs } from './config.js';
import { installImageDataShim } from './imageData.js';
import { runConversion } from './processor.js';
import { FILM_PROFILES } from './vendor/constants.js';
import type { CliRunSummary } from './types.js';

function writeLine(message: string) {
  process.stdout.write(`${message}\n`);
}

function writeError(message: string) {
  process.stderr.write(`${message}\n`);
}

function printHumanSummary(summary: CliRunSummary) {
  writeLine(`DarkSlide CLI: ${summary.totals.matched} matched, ${summary.totals.done} converted, ${summary.totals.skipped} skipped, ${summary.totals.failed} failed`);
  for (const file of summary.files) {
    if (file.status === 'done') {
      writeLine(`done    ${file.inputPath} -> ${file.outputPath}`);
    } else if (file.status === 'pending') {
      writeLine(`pending ${file.inputPath} -> ${file.outputPath}`);
    } else if (file.status === 'skipped') {
      writeLine(`skip    ${file.inputPath} -> ${file.outputPath}`);
    } else {
      writeLine(`error   ${file.inputPath}: ${file.error ?? 'Unknown error'}`);
    }
  }
}

function getProfileList() {
  return FILM_PROFILES
    .map((profile) => ({
      id: profile.id,
      name: profile.name,
      type: profile.type,
      filmType: profile.filmType ?? 'negative',
      category: profile.category ?? 'Generic',
      description: profile.description,
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function printProfiles(json: boolean) {
  const profiles = getProfileList();
  if (json) {
    writeLine(JSON.stringify({ profiles }, null, 2));
    return;
  }

  for (const profile of profiles) {
    writeLine(`${profile.id}\t${profile.name}\t${profile.type}\t${profile.filmType}\t${profile.category}\t${profile.description}`);
  }
}

export async function main(argv = process.argv.slice(2)) {
  installImageDataShim();

  try {
    const args = parseArgs(argv);
    if (args.help) {
      writeLine(getHelpText());
      return 0;
    }

    if (args.listProfiles) {
      printProfiles(Boolean(args.json));
      return 0;
    }

    if (args.printDefaultConfig) {
      writeLine(JSON.stringify(getDefaultConfig(), null, 2));
      return 0;
    }

    const config = await loadCliConfig(args);
    const summary = await runConversion(config);

    if (config.json) {
      writeLine(JSON.stringify(summary, null, 2));
    } else {
      printHumanSummary(summary);
    }

    return summary.totals.failed > 0 ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof UsageError) {
      writeError(message);
      return 2;
    }

    writeError(message);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const code = await main();
  process.exitCode = code;
}
