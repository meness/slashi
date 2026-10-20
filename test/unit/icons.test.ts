import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { icons } from '@phosphor-icons/core';
import { describe, expect, it } from 'vitest';
import { detectProject } from '../../src/core/detect';
import { pickIcon, ruleIcons } from '../../src/core/icons';
import { TRANSFORMS } from '../../src/core/transforms';

const catalog = new Set(icons.map((i) => i.name));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

describe('Phosphor icons', () => {
  it('every icon literal in the source exists in Phosphor', () => {
    const missing: string[] = [];
    for (const file of sourceFiles('src')) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/\bicon(?::\s*|\(\s*)'([a-z0-9-]+)'/g)) if (!catalog.has(m[1])) missing.push(`${file}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });

  it('rule, transform and project icons exist', () => {
    const fixture = detectProject([
      {
        dir: '',
        files: ['package.json', 'Dockerfile', 'compose.yaml', 'Cargo.toml', 'go.mod', 'pom.xml', 'Gemfile', 'composer.json', 'artisan', 'pubspec.yaml', 'CMakeLists.txt', 'main.tf', 'Chart.yaml', '.pre-commit-config.yaml', 'manage.py', 'requirements.txt', 'Makefile', 'mix.exs', 'Package.swift', 'app.csproj', 'Taskfile.yml', 'build.gradle', 'deno.json'],
        read: {
          'package.json': JSON.stringify({
            scripts: { dev: 'x', test: 'x', lint: 'x', build: 'x', format: 'x', deploy: 'x', clean: 'x', 'db:seed': 'x', docs: 'x', other: 'x' },
            devDependencies: Object.fromEntries(
              ['typescript', 'tsx', 'eslint', '@biomejs/biome', 'prettier', 'vitest', 'jest', '@playwright/test', 'cypress', 'next', 'vite', 'astro', 'nuxt', '@sveltejs/kit', '@angular/cli', 'expo', 'prisma', 'drizzle-kit', 'storybook', 'turbo', 'nx', '@changesets/cli'].map((d) => [d, '1']),
            ),
          }),
          'Cargo.toml': '',
          'go.mod': '',
          'pom.xml': 'spring-boot',
          'build.gradle': 'spring com.android',
          Gemfile: "gem 'rails'\ngem 'rspec'",
          'composer.json': '{"scripts":{"test":"x"}}',
          'pubspec.yaml': 'flutter:\n',
          'Chart.yaml': '',
          'requirements.txt': 'pytest\nruff\nblack\nmypy\ndjango',
          Makefile: 'all:\n',
          'mix.exs': ':phoenix',
          'deno.json': '{"tasks":{"dev":"x"}}',
        },
      },
    ]);
    const used = [...ruleIcons(), ...TRANSFORMS.map((t) => t.icon), ...fixture.commands.map((c) => c.icon), pickIcon('nothing matches here')];
    expect(used.filter((i) => !catalog.has(i))).toEqual([]);
  });

  it('picks sensible icons', () => {
    expect(pickIcon('Git: Push')).toBe('cloud-arrow-up');
    expect(pickIcon('Debug: Toggle Breakpoint')).toBe('bug');
    expect(pickIcon('Preferences: Color Theme')).toBe('palette');
  });
});

describe('marketplace packs', () => {
  it('use existing Phosphor icons', () => {
    const missing: string[] = [];
    for (const file of readdirSync('marketplace/packs')) {
      const pack = JSON.parse(readFileSync(join('marketplace/packs', file), 'utf8'));
      for (const name of [pack.icon, ...pack.commands.map((c: { icon?: string }) => c.icon)]) if (name && !catalog.has(name)) missing.push(`${file}: ${name}`);
    }
    expect(missing).toEqual([]);
  });
});
