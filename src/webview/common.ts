// Helpers shared by the webview scripts.

interface VsCodeApi {
  postMessage(message: unknown): void;
  // Typed per call, like VS Code's own acquireVsCodeApi() declaration.
  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters
  getState<T>(): T | undefined;
  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters
  setState<T>(state: T): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

export const vscode: VsCodeApi = acquireVsCodeApi();

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(text: string | undefined): string {
  return (text ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Phosphor icon markup. Names come from our own catalog and are sanitized anyway. */
export function icon(name: string, weight: 'regular' | 'duotone' = 'regular'): string {
  const safe = name.replace(/[^a-z0-9-]/g, '');
  return `<i class="${weight === 'duotone' ? 'ph-duotone' : 'ph'} ph-${safe}" aria-hidden="true"></i>`;
}

export function $(selector: string, root: ParentNode = document): HTMLElement {
  return root.querySelector(selector) as HTMLElement;
}

export const isMac = navigator.platform.toLowerCase().includes('mac');
export const MOD = isMac ? '⌘' : 'Ctrl';
