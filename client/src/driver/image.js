/**
 * Shrink a camera photo before upload (12 MP ≈ 4 MB → ~1800 px ≈ 300 KB), which matters on a
 * weak mobile connection. The server re-encodes again and strips metadata either way.
 */
export async function downscaleImage(file, maxEdge = 1800, quality = 0.82) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    return blob ?? file;
  } catch {
    return file; // unsupported format in this browser: let the server handle it
  }
}
