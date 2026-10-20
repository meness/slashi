import { describe, expect, it } from 'vitest';
import { expandTemplate, shellQuote, templateVariables } from '../../src/core/template';

const vars: Record<string, string> = { file: '/tmp/my file.ts', args: "it's", empty: '', 'env:HOME': '/home/me' };
const resolve = (name: string) => vars[name];

describe('expandTemplate', () => {
  it('expands variables, defaults and env', () => {
    expect(expandTemplate('code ${file}', resolve)).toBe('code /tmp/my file.ts');
    expect(expandTemplate('${missing:fallback} ${env:HOME}', resolve)).toBe('fallback /home/me');
  });
  it('shell-quotes with q:', () => {
    expect(expandTemplate('eslint ${q:file}', resolve)).toBe("eslint '/tmp/my file.ts'");
    expect(expandTemplate('echo ${q:args}', resolve)).toBe(`echo 'it'\\''s'`);
  });
  it('supports escaping with $$', () => {
    expect(expandTemplate('echo $${HOME}', resolve)).toBe('echo ${HOME}');
  });
  it('lists referenced variables', () => {
    expect(templateVariables('a ${args} ${q:file} ${env:X} $${skip} ${input:name}').sort()).toEqual(['args', 'env:X', 'file', 'input:name']);
  });
});

describe('shellQuote', () => {
  it('leaves safe strings alone and quotes others per shell', () => {
    expect(shellQuote('src/index.ts')).toBe('src/index.ts');
    expect(shellQuote("a b'c")).toBe(`'a b'\\''c'`);
    expect(shellQuote("a'b", 'powershell')).toBe("'a''b'");
    expect(shellQuote('a"b', 'cmd')).toBe('"a""b"');
  });
});
