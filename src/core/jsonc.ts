// JSON with comments (team files, deno.jsonc…), parsed and edited like VS Code does.
// Kept out of text.ts so the webviews don't bundle the parser.

import { applyEdits, findNodeAtLocation, modify, parse, parseTree, printParseErrorCode, type ParseError } from 'jsonc-parser';

/** Parses JSONC: comments and trailing commas are fine. Throws a SyntaxError on anything else that's invalid. */
export function parseJsonc(text: string): unknown {
  const errors: ParseError[] = [];
  const value: unknown = parse(text, errors, { allowTrailingComma: true });
  if (errors.length) throw new SyntaxError(`${printParseErrorCode(errors[0].error)} at offset ${errors[0].offset}`);
  return value;
}

/** Adds `command` to a team file (a `commands` array or a bare array), replacing one with the same name. Keeps comments. */
export function addCommand(text: string, command: { name: string }): string {
  const json = parseJsonc(text);
  const base: (string | number)[] = Array.isArray(json) ? [] : ['commands'];
  const list = findNodeAtLocation(parseTree(text, [], { allowTrailingComma: true })!, base);
  const index =
    list?.type === 'array' ? (list.children ?? []).findIndex((c) => findNodeAtLocation(c, ['name'])?.value === command.name) : -1;
  const path = list?.type === 'array' ? [...base, index === -1 ? list.children!.length : index] : base;
  const value = list?.type === 'array' ? command : [command];
  const edits = modify(text, path, value, {
    isArrayInsertion: index === -1 && list?.type === 'array',
    formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' },
  });
  return applyEdits(text, edits);
}
