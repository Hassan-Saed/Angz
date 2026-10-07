const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { encrypt, decrypt } = require('./crypto');

/**
 * Server-side storage for uploaded images.
 *
 * Security decisions, each deliberate:
 *
 *  - The stored filename is random (`crypto.randomBytes`), never derived from
 *    the client's filename. A name like `../../etc/passwd` or `shell.php` then
 *    has no effect on where the file lands or how it is served.
 *  - The file type is decided by reading the first bytes (magic numbers), not
 *    by trusting `Content-Type` or the file extension, both of which the
 *    client controls.
 *  - Uploads land outside the web root and are served through a dedicated route
 *    with `Content-Disposition: inline`, `X-Content-Type-Options: nosniff`, and
 *    an explicit allow-list of content types.
 *  - SVG is rejected. It is an XML document that can carry script, and serving
 *    one from the same origin as the app would be a stored-XSS vector.
 */

const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(__dirname, '..', 'uploads');

const KINDS = {
  // 5MB rather than 2MB: phone camera photos routinely exceed 2MB and were
  // rejected before the user could even pick them.
  avatar: { maxBytes: 5 * 1024 * 1024, dir: 'avatars' },
  attachment: { maxBytes: 10 * 1024 * 1024, dir: 'attachments' },
};

/** Magic-number signatures for the formats we accept. */
const SIGNATURES = [
  { mime: 'image/jpeg', ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/gif', ext: 'gif', bytes: [0x47, 0x49, 0x46, 0x38] },
  {
    mime: 'image/webp',
    ext: 'webp',
    // Layout is "RIFF" <4 size bytes> "WEBP", so the two markers sit at
    // different offsets and each needs its own position.
    bytes: [0x52, 0x49, 0x46, 0x46],
    second: { offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  },
  // BMP is a legacy format Windows still hands out; it was rejected even though
  // it is a safe, non-executable raster image.
  { mime: 'image/bmp', ext: 'bmp', bytes: [0x42, 0x4d] },
];

function matchesAt(buffer, bytes, offset) {
  return bytes.every((b, i) => buffer[offset + i] === b);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/** Returns the detected `{mime, ext}`, or null if the bytes are not an image. */
function detectImageType(buffer) {
  if (!buffer || buffer.length < 16) return null;

  for (const sig of SIGNATURES) {
    if (!matchesAt(buffer, sig.bytes, sig.offset || 0)) continue;
    if (sig.second && !matchesAt(buffer, sig.second.bytes, sig.second.offset)) continue;
    return { mime: sig.mime, ext: sig.ext };
  }
  return null;
}

/** Public URL for a stored file. */
function publicUrl(storedName) {
  return `/uploads/${storedName}`;
}

/**
 * Persists an uploaded image and returns its record fields.
 * Throws on unsupported types or oversized files.
 */
function storeImage({ buffer, kind, originalName }) {
  const config = KINDS[kind];
  if (!config) {
    throw Object.assign(new Error('Unsupported upload kind'), { status: 400 });
  }
  if (!buffer || buffer.length === 0) {
    throw Object.assign(new Error('Empty upload'), { status: 400 });
  }
  if (buffer.length > config.maxBytes) {
    throw Object.assign(
      new Error(`File too large. Maximum is ${Math.floor(config.maxBytes / 1024 / 1024)}MB`),
      { status: 413 },
    );
  }

  const detected = detectImageType(buffer);
  if (!detected) {
    throw Object.assign(
      new Error('Unsupported image format. Use JPEG, PNG, GIF or WebP.'),
      { status: 415 },
    );
  }

  ensureDir(path.join(UPLOAD_ROOT, config.dir));

  const storedName = path.posix.join(
    config.dir,
    `${Date.now()}-${crypto.randomBytes(16).toString('hex')}.${detected.ext}`,
  );
  const absolute = path.join(UPLOAD_ROOT, storedName);

  // Defence in depth: the resolved path must stay inside the upload root.
  if (!absolute.startsWith(UPLOAD_ROOT + path.sep)) {
    throw Object.assign(new Error('Invalid storage path'), { status: 500 });
  }

  fs.writeFileSync(absolute, buffer);

  return {
    storedName,
    mimeType: detected.mime,
    sizeBytes: buffer.length,
    // Sanitised for display only; never used to build a path.
    originalName: sanitizeDisplayName(originalName),
  };
}

/** Removes a stored file. Missing files are ignored. */
function removeStored(storedName) {
  if (!storedName) return;
  const absolute = path.join(UPLOAD_ROOT, storedName);
  if (!absolute.startsWith(UPLOAD_ROOT + path.sep)) return;
  try {
    fs.unlinkSync(absolute);
  } catch {
    // Already gone.
  }
}

/** Strips path separators and control characters from a client-supplied name. */
function sanitizeDisplayName(name) {
  if (typeof name !== 'string') return null;
  const base = path.basename(name).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return base.slice(0, 255) || null;
}

/**
 * Absolute path for serving, or null when the request is not a stored image.
 * Rejects any traversal attempt.
 */
function resolveForServing(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) return null;
  const absolute = path.resolve(UPLOAD_ROOT, relativePath);
  if (!absolute.startsWith(UPLOAD_ROOT + path.sep)) return null;
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) return null;
  return absolute;
}

module.exports = {
  UPLOAD_ROOT,
  KINDS,
  detectImageType,
  storeImage,
  removeStored,
  publicUrl,
  sanitizeDisplayName,
  resolveForServing,
  // Re-exported so callers do not need a second require of the same module.
  encrypt,
  decrypt,
};