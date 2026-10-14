export function decodeUtf16Le(bytes: Uint8Array): string {
  let text = Buffer.from(bytes).toString('utf16le');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}
export function splitDecoded(text: string): string[] { return text.replace(/\r\n?/g, '\n').split('\n').filter((_, i, a) => i < a.length - 1 || a[a.length - 1] !== ''); }
export function decodeLines(bytes: Uint8Array): string[] { return splitDecoded(decodeUtf16Le(bytes)); }
