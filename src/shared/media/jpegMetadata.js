// Lossless JPEG container rewrite: remove EXIF/XMP/IPTC/comments/ICC without
// decoding or changing pixels. Unsupported multi-scan JPEGs fail closed.
export function stripJpegMetadata(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Unsupported JPEG.");
  const chunks = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset < bytes.length) {
    const markerStart = offset;
    if (bytes[offset++] !== 0xff) throw new Error("Invalid JPEG marker.");
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xda) {
      if (offset + 2 > bytes.length) throw new Error("Incomplete JPEG scan.");
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length >= bytes.length || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) throw new Error("Incomplete JPEG.");
      for (let index = offset + length; index < bytes.length - 1; index += 1) {
        if (bytes[index] !== 0xff) continue;
        const next = bytes[index + 1];
        if (next === 0 || next === 0xff || (next >= 0xd0 && next <= 0xd7)) { index += 1; continue; }
        if (next !== 0xd9 || index !== bytes.length - 2) throw new Error("Unsupported multi-scan JPEG.");
      }
      chunks.push(bytes.subarray(markerStart));
      const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
      let cursor = 0;
      for (const chunk of chunks) { result.set(chunk, cursor); cursor += chunk.length; }
      return result;
    }
    if (marker === 0xd9 || marker === 0 || (marker >= 0xd0 && marker <= 0xd8) || marker === 1 || offset + 2 > bytes.length) throw new Error("Invalid JPEG.");
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) throw new Error("Incomplete JPEG segment.");
    const adobeColourMarker = marker === 0xee && length === 14
      && String.fromCharCode(...bytes.subarray(offset + 2, offset + 7)) === "Adobe";
    const metadata = (marker >= 0xe0 && marker <= 0xef && !adobeColourMarker) || marker === 0xfe;
    if (!metadata) chunks.push(bytes.subarray(markerStart, offset + length));
    offset += length;
  }
  throw new Error("JPEG scan missing.");
}
