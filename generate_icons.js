const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function createPNG(size, bgHex, symbol) {
  // Simple uncompressed RGBA image
  const width = size;
  const height = size;
  
  // Parse hex color
  const r = parseInt(bgHex.slice(1, 3), 16);
  const g = parseInt(bgHex.slice(3, 5), 16);
  const b = parseInt(bgHex.slice(5, 7), 16);

  // Raw image data with scanline filter byte (0 = none)
  const rawData = Buffer.alloc(height * (width * 4 + 1));
  let offset = 0;

  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.44;

  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter byte
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Rounded app icon shape
      const cornerR = width * 0.22;
      const rx = Math.max(Math.abs(dx) - (cx - cornerR), 0);
      const ry = Math.max(Math.abs(dy) - (cy - cornerR), 0);
      const cornerDist = Math.sqrt(rx * rx + ry * ry);

      if (cornerDist <= cornerR) {
        // Gradient color
        const t = (x + y) / (width + height);
        const pr = Math.round(r * (1 - t * 0.3) + 99 * t * 0.5);
        const pg = Math.round(g * (1 - t * 0.3) + 102 * t * 0.5);
        const pb = Math.round(b * (1 - t * 0.2) + 241 * t * 0.6);

        // Center cart / cash register accent square
        const inCenter = Math.abs(dx) < width * 0.22 && Math.abs(dy) < height * 0.22;
        if (inCenter && (Math.abs(dx) > width * 0.18 || Math.abs(dy) > height * 0.18 || (Math.abs(dx) < width * 0.08 && Math.abs(dy) < width * 0.08))) {
          rawData[offset++] = 255;
          rawData[offset++] = 255;
          rawData[offset++] = 255;
          rawData[offset++] = 255;
        } else {
          rawData[offset++] = Math.min(255, pr);
          rawData[offset++] = Math.min(255, pg);
          rawData[offset++] = Math.min(255, pb);
          rawData[offset++] = 255;
        }
      } else {
        // Transparent
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
      }
    }
  }

  // Compress with deflate
  const compressed = zlib.deflateSync(rawData);

  // PNG header
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdr);

  // IDAT chunk
  const idatChunk = makeChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const typeAndData = Buffer.concat([typeBuf, data]);

  const crc = crc32(typeAndData);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc, 0);

  return Buffer.concat([len, typeAndData, crcBuf]);
}

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), createPNG(192, '#6366f1'));
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), createPNG(512, '#6366f1'));
console.log('Icons generated successfully in icons/ folder');
