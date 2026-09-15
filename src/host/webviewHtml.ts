import * as vscode from 'vscode';

/** Folder holding the webview bundles produced by esbuild.mjs. */
export function webviewMediaRoot(extensionUri: vscode.Uri): vscode.Uri {
  return vscode.Uri.joinPath(extensionUri, 'dist', 'webview');
}

/** HTML shell loading `<bundle>.js` / `<bundle>.css` with a strict Content Security Policy. */
export function webviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, bundle: string, title: string): string {
  const mediaRoot = webviewMediaRoot(extensionUri);
  const asset = (name: string) => webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, name));
  const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} data:; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${asset('codicon.css')}" rel="stylesheet">
  <link href="${asset(`${bundle}.css`)}" rel="stylesheet">
  <title>${title}</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${asset(`${bundle}.js`)}"></script>
</body>
</html>`;
}
