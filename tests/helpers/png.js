/**
 * PNG header reader for file-content contract tests.
 *
 * Art and icons are committed binaries, so a test cannot look inside them the way it inspects a
 * module. The one thing worth asserting is the thing a mistake would silently break: that the file
 * really is a PNG and really is the pixel size the manifest or pack claims. Neither the icon test
 * nor the art pack test should re-derive that parsing.
 */

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Width and height from a PNG's IHDR chunk: signature (8 bytes), chunk length and type (8 bytes),
 * then width and height as big-endian uint32.
 *
 * @throws when the bytes are not a PNG, so a wrong file type fails loudly instead of reading
 *   meaningless numbers out of an arbitrary binary.
 */
export function pngSize(bytes) {
  if (bytes.length < 24) {
    throw new Error(`Not a PNG: only ${bytes.length} bytes`);
  }
  if (!SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    throw new Error('Not a PNG: signature bytes do not match');
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** `192x192` — the form a web app manifest uses for icon sizes. */
export function formatSize(size) {
  return `${size.width}x${size.height}`;
}

/** Parses a manifest `sizes` string into `{ width, height }`. */
export function parseSize(text) {
  const [width, height] = String(text).split('x').map(Number);
  return { width, height };
}
