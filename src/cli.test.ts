import { describe, expect, it } from 'vitest';
import { main } from './cli.js';

async function captureMain(args: string[]) {
  let stdout = '';
  let stderr = '';
  const originalStdoutWrite = process.stdout.write;
  const originalStderrWrite = process.stderr.write;

  Reflect.set(process.stdout, 'write', (chunk: unknown) => {
    stdout += String(chunk);
    return true;
  });
  Reflect.set(process.stderr, 'write', (chunk: unknown) => {
    stderr += String(chunk);
    return true;
  });

  try {
    const code = await main(args);
    return { code, stdout, stderr };
  } finally {
    Reflect.set(process.stdout, 'write', originalStdoutWrite);
    Reflect.set(process.stderr, 'write', originalStderrWrite);
  }
}

describe('CLI entry point', () => {
  it('prints profiles in deterministic JSON mode', async () => {
    const result = await captureMain(['--list-profiles', '--json']);
    const parsed = JSON.parse(result.stdout) as { profiles: Array<{ id: string; name: string; type: string; filmType: string; category: string; description: string }> };

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(parsed.profiles.length).toBeGreaterThan(0);
    expect(parsed.profiles.map((profile) => profile.id)).toEqual([...parsed.profiles.map((profile) => profile.id)].sort());
    expect(parsed.profiles.find((profile) => profile.id === 'generic-color')).toMatchObject({
      name: 'Generic Color',
      type: 'color',
      filmType: 'negative',
      category: 'Generic',
    });
  });

  it('prints profiles in human mode', async () => {
    const result = await captureMain(['--list-profiles']);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('generic-color\tGeneric Color\tcolor\tnegative\tGeneric');
  });

  it('prints the default config without requiring input', async () => {
    const result = await captureMain(['--print-default-config']);
    const parsed = JSON.parse(result.stdout) as { input: string[]; profile: string; format: string; auto: { filmBase: boolean } };

    expect(result.code).toBe(0);
    expect(parsed.input).toEqual([]);
    expect(parsed.profile).toBe('generic-color');
    expect(parsed.format).toBe('jpeg');
    expect(parsed.auto.filmBase).toBe(true);
  });

  it('returns code 2 for unknown profiles', async () => {
    const result = await captureMain(['--input', 'scan.tif', '--profile', 'not-a-profile']);

    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/Unknown profile/);
    expect(result.stdout).toBe('');
  });
});
