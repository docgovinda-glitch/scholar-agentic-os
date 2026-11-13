/**
 * Reads an image file into a downscaled JPEG/PNG data URL. Images live inside
 * the deck (no external hosting), which the app's CSP allows and which the
 * .pptx exporter can embed directly.
 */
export async function imageFileToDataUrl(file: File, maxSide = 1600): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.');
  if (file.size > 15 * 1024 * 1024) throw new Error('That image is larger than 15 MB.');
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('That image format is not supported.'));
    el.src = raw;
  });
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return raw;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const keepAlpha = file.type === 'image/png' || file.type === 'image/gif' || file.type === 'image/webp';
  return canvas.toDataURL(keepAlpha ? 'image/png' : 'image/jpeg', 0.85);
}
