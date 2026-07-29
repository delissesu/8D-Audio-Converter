const ALLOWED_TYPES = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/flac",
  "audio/ogg",
  "audio/aac",
  "audio/x-m4a",
  "audio/mp4",
]);

const MAX_SIZE_BYTES = 100 * 1024 * 1024;

export function validateFile(file) {
  if (!file.type || (!ALLOWED_TYPES.has(file.type) && !file.type.startsWith("audio/"))) {
    return "Unsupported file type. Use MP3, WAV, FLAC, OGG, AAC, or M4A.";
  }
  if (file.size > MAX_SIZE_BYTES) {
    return "File is too large. Maximum size is 100 MB.";
  }
  if (file.size === 0) {
    return "File is empty.";
  }
  return null;
}
