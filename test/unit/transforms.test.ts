import { describe, expect, it } from 'vitest';
import * as t from '../../src/core/transforms';

describe('case conversion', () => {
  it('splits words from any style', () => {
    expect(t.splitWords('fooBar-baz_qux HTTPServer')).toEqual(['foo', 'bar', 'baz', 'qux', 'http', 'server']);
  });

  it.each([
    [t.toCamel, 'hello world-foo', 'helloWorldFoo'],
    [t.toPascal, 'hello_world', 'HelloWorld'],
    [t.toSnake, 'helloWorld', 'hello_world'],
    [t.toKebab, 'HelloWorld', 'hello-world'],
    [t.toConstant, 'helloWorld', 'HELLO_WORLD'],
    [t.toDot, 'hello world', 'hello.world'],
    [t.toTitle, 'hello wORLD', 'Hello World'],
    [t.toSentence, 'HELLO. world', 'Hello. World'],
  ])('%o converts', (fn, input, expected) => {
    expect(fn(input)).toBe(expected);
  });

  it('keeps line structure and indentation', () => {
    expect(t.toSnake('  fooBar\n  bazQux')).toBe('  foo_bar\n  baz_qux');
  });
});

describe('line tools', () => {
  it('sorts naturally', () => {
    expect(t.sortLines('b10\nb2\na')).toBe('a\nb2\nb10');
    expect(t.sortLines('a\nc\nb', true)).toBe('c\nb\na');
  });
  it('dedupes, trims, numbers and joins', () => {
    expect(t.uniqueLines('a\nb\na')).toBe('a\nb');
    expect(t.removeBlankLines('a\n\n \nb')).toBe('a\nb');
    expect(t.trimLines('a  \nb\t')).toBe('a\nb');
    expect(t.numberLines('a\nb')).toBe('1. a\n2. b');
    expect(t.joinLines(' a \n\n b ', ', ')).toBe('a, b');
    expect(t.reverseLines('1\n2')).toBe('2\n1');
  });
});

describe('encoding', () => {
  it('round-trips base64 and validates input', () => {
    expect(t.base64Decode(t.base64Encode('héllo ✓'))).toBe('héllo ✓');
    expect(() => t.base64Decode('not base64!')).toThrow('Selection is not valid Base64.');
  });
  it('formats, minifies and sorts JSON', () => {
    expect(t.jsonPretty('{"b":1,"a":[1]}')).toBe('{\n  "b": 1,\n  "a": [\n    1\n  ]\n}');
    expect(t.jsonMinify('{ "a" : 1 }')).toBe('{"a":1}');
    expect(t.jsonSortKeys('{"b":{"d":1,"c":2},"a":0}')).toBe('{\n  "a": 0,\n  "b": {\n    "c": 2,\n    "d": 1\n  }\n}');
  });
  it('escapes strings and HTML', () => {
    expect(t.escapeJsonString('a "b"\n')).toBe('a \\"b\\"\\n');
    expect(t.unescapeJsonString('a \\"b\\"\\n')).toBe('a "b"\n');
    expect(t.unescapeHtml(t.escapeHtml(`<a href="x">'&'</a>`))).toBe(`<a href="x">'&'</a>`);
  });
});

describe('generators and stats', () => {
  it('generates lorem paragraphs within bounds', () => {
    expect(t.lorem(2).split('\n\n')).toHaveLength(2);
    expect(t.lorem(999).split('\n\n')).toHaveLength(20);
    expect(t.lorem(NaN).split('\n\n')).toHaveLength(1);
  });
  it('counts words', () => {
    expect(t.textStats('one two\nthree')).toBe('3 words · 13 characters · 2 lines · ~1 min read');
  });
  it('has unique transform names', () => {
    const names = t.TRANSFORMS.map((x) => x.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it('produces a UUID', () => {
    const uuid = t.TRANSFORMS.find((x) => x.name === 'uuid')!.apply('', '');
    expect(uuid).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('TRANSFORMS wiring', () => {
  const run = (name: string, text: string, args = '') => t.TRANSFORMS.find((x) => x.name === name)!.apply(text, args);

  it.each([
    ['sort-desc', 'a\nc\nb', 'c\nb\na'],
    ['urlencode', 'a b&c', 'a%20b%26c'],
    ['urldecode', 'a%20b%26c', 'a b&c'],
    ['sha256', 'abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['md5', 'abc', '900150983cd24fb0d6963f7d28e17f72'],
    ['join', 'a\nb', 'a b'],
  ])('%s', (name, input, expected) => {
    expect(run(name, input)).toBe(expected);
  });
});
