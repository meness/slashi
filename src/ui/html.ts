import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';

/** Builds a webview document with a strict nonce-based CSP. Only bundled local assets are loaded. */
export function webviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, options: { title: string; script: string; styles: string[]; body?: string }): string {
  const nonce = randomBytes(16).toString('base64');
  const asset = (path: string) => webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'webview', path));
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} https: data:`,
    `font-src ${webview.cspSource}`,
    `style-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');
  const styles = ['phosphor/regular/style.css', 'phosphor/duotone/style.css', 'base.css', ...options.styles]
    .map((s) => `<link rel="stylesheet" href="${asset(s)}">`)
    .join('\n    ');
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${options.title}</title>
    ${styles}
  </head>
  <body>
    ${options.body ?? '<div id="app"></div>'}
    <script nonce="${nonce}" src="${asset(options.script)}"></script>
  </body>
</html>`;
}

export function webviewOptions(extensionUri: vscode.Uri): vscode.WebviewPanelOptions & vscode.WebviewOptions {
  return {
    enableScripts: true,
    localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')],
  };
}

export function panelIcon(extensionUri: vscode.Uri): { light: vscode.Uri; dark: vscode.Uri } {
  return {
    light: vscode.Uri.joinPath(extensionUri, 'media', 'slash-light.svg'),
    dark: vscode.Uri.joinPath(extensionUri, 'media', 'slash-dark.svg'),
  };
}
