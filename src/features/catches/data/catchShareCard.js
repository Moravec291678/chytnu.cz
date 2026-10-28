import { normalizePhotoFrame } from "./photoFraming.js";

function imageDimensions(image) {
  return { width: image.naturalWidth || image.width, height: image.naturalHeight || image.height };
}

export async function decodeSharePhoto(blob) {
  if (!(blob instanceof Blob)) throw new TypeError("Fotografie úlovku není dostupná.");
  if (globalThis.createImageBitmap) return createImageBitmap(blob);
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Fotografii úlovku se nepodařilo načíst."));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function drawShareCover(context, image, x, y, width, height, photoFrame = {}) {
  const { width: imageWidth, height: imageHeight } = imageDimensions(image);
  if (!imageWidth || !imageHeight) throw new Error("Fotografie nemá platné rozměry.");
  const { focalX, focalY, zoom } = normalizePhotoFrame(photoFrame);
  const scale = Math.max(width / imageWidth, height / imageHeight) * zoom;
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (imageWidth - sourceWidth) * focalX;
  const sourceY = (imageHeight - sourceHeight) * focalY;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

export function getSharePreviewFrameStyle(photo = {}) {
  const frame = normalizePhotoFrame(photo);
  const focalX = `${frame.focalX * 100}%`;
  const focalY = `${frame.focalY * 100}%`;
  return {
    objectPosition: `${focalX} ${focalY}`,
    transform: `scale(${frame.zoom})`,
    transformOrigin: `${focalX} ${focalY}`,
  };
}

function roundedRectPath(context, x, y, width, height, radius) {
  context.beginPath();
  if (typeof context.roundRect === "function") context.roundRect(x, y, width, height, radius);
  else {
    context.moveTo(x + radius, y);
    context.arcTo(x + width, y, x + width, y + height, radius);
    context.arcTo(x + width, y + height, x, y + height, radius);
    context.arcTo(x, y + height, x, y, radius);
    context.arcTo(x, y, x + width, y, radius);
    context.closePath();
  }
}

function drawFishMark(context, color) {
  context.save();
  context.translate(540, 1260);
  context.scale(0.78, 0.78);
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(-180, 0);
  context.bezierCurveTo(-105, -110, 75, -110, 150, 0);
  context.lineTo(245, -78);
  context.lineTo(245, 78);
  context.lineTo(150, 0);
  context.bezierCurveTo(75, 110, -105, 110, -180, 0);
  context.fill();
  context.beginPath();
  context.arc(92, -24, 9, 0, Math.PI * 2);
  context.fillStyle = "#111820";
  context.fill();
  context.restore();
}

function fitText(context, text, maxWidth) {
  let result = String(text ?? "");
  if (context.measureText(result).width <= maxWidth) return result;
  while (result.length > 1 && context.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1);
  return `${result}…`;
}

function formatValue(value, maximumFractionDigits) {
  return Number.isFinite(value) ? value.toLocaleString("cs-CZ", { maximumFractionDigits }) : null;
}

function formatDate(value) {
  return value ? new Intl.DateTimeFormat("cs-CZ", { dateStyle: "long" }).format(new Date(value)) : "";
}

export async function renderShareCard(data, photoBlob = null, photoFrame = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1800;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Grafickou kartu se nepodařilo vytvořit v tomto prohlížeči.");

  const styles = getComputedStyle(document.documentElement);
  const readColor = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  const appBackground = readColor("--app-bg", "#111820");
  const surface = readColor("--surface-2", "#202e40");
  const green = readColor("--accent-green", "#2ecc71");
  const orange = readColor("--accent-orange", "#ffab1f");
  const primaryText = readColor("--text-primary", "#eff5ff");
  const secondaryText = readColor("--text-secondary", "#829db8");
  const font = '"Inter", "Arial", sans-serif';
  const length = formatValue(data.lengthCm, 1);
  const weight = formatValue(data.weightKg, 2);

  let photo = null;
  if (photoBlob) {
    try { photo = await decodeSharePhoto(photoBlob); } catch { photo = null; }
  }
  try {
    const background = context.createLinearGradient(0, 0, 1080, 1800);
    background.addColorStop(0, surface);
    background.addColorStop(.38, appBackground);
    background.addColorStop(1, "#0b121b");
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);

    context.strokeStyle = "rgba(255,255,255,.12)";
    context.lineWidth = 2;
    context.strokeRect(42, 42, 996, 1716);

    context.textAlign = "center";
    context.fillStyle = secondaryText;
    context.font = `800 26px ${font}`;
    context.fillText("CHYTNUCZ  /  RYBÁŘSKÝ DENÍK", 540, 105);
    context.strokeStyle = "rgba(255,255,255,.14)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(250, 142);
    context.lineTo(830, 142);
    context.stroke();

    const badgeText = String(data.rarity ?? "Úlovek").toLocaleUpperCase("cs-CZ");
    const badgeWidth = Math.max(190, context.measureText(badgeText).width + 54);
    roundedRectPath(context, (1080 - badgeWidth) / 2, 178, badgeWidth, 54, 18);
    context.fillStyle = data.rarityKey === "legendary" || data.rarityKey === "epic" ? orange : "rgba(255,255,255,.08)";
    context.fill();
    context.fillStyle = data.rarityKey === "legendary" || data.rarityKey === "epic" ? appBackground : secondaryText;
    context.font = `800 22px ${font}`;
    context.fillText(badgeText, 540, 213);

    context.fillStyle = primaryText;
    context.font = `800 62px ${font}`;
    context.fillText(fitText(context, String(data.species ?? "Úlovek").toLocaleUpperCase("cs-CZ"), 900), 540, 336);

    context.fillStyle = orange;
    context.fillRect(492, 379, 96, 4);

    let metaY = 630;
    if (length !== null) {
      context.fillStyle = secondaryText;
      context.font = `800 22px ${font}`;
      context.fillText("DÉLKA", 540, 435);
      context.fillStyle = primaryText;
      context.font = `800 148px ${font}`;
      context.fillText(fitText(context, `${length} cm`, 900), 540, 562);
      metaY = 720;
    } else if (weight !== null) {
      metaY = 650;
    } else {
      context.fillStyle = secondaryText;
      context.font = `600 34px ${font}`;
      context.fillText("Zaznamenaný úlovek", 540, 550);
      metaY = 650;
    }

    if (weight !== null) {
      context.fillStyle = secondaryText;
      context.font = `800 20px ${font}`;
      context.fillText("VÁHA", 540, metaY - 25);
      context.fillStyle = primaryText;
      context.font = `600 48px ${font}`;
      context.fillText(fitText(context, `${weight} kg`, 820), 540, metaY + 30);
      metaY += 96;
    }

    const details = [data.waterName, formatDate(data.caughtAt)].filter(Boolean);
    context.fillStyle = secondaryText;
    context.font = `500 26px ${font}`;
    details.forEach((line, index) => context.fillText(fitText(context, line, 860), 540, metaY + index * 38));

    const photoX = 210;
    const photoY = 900;
    const photoW = 660;
    const photoH = 780;
    context.save();
    roundedRectPath(context, photoX, photoY, photoW, photoH, 30);
    context.clip();
    if (photo) {
      drawShareCover(context, photo, photoX, photoY, photoW, photoH, photoFrame);
    } else {
      const placeholder = context.createLinearGradient(photoX, photoY, photoX + photoW, photoY + photoH);
      placeholder.addColorStop(0, "rgba(255,255,255,.07)");
      placeholder.addColorStop(1, "rgba(255,255,255,.015)");
      context.fillStyle = placeholder;
      context.fillRect(photoX, photoY, photoW, photoH);
      context.strokeStyle = "rgba(255,255,255,.08)";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(540, 1290, 228, 0, Math.PI * 2);
      context.stroke();
      drawFishMark(context, orange);
    }
    context.restore();
    context.strokeStyle = "rgba(255,255,255,.34)";
    context.lineWidth = 3;
    roundedRectPath(context, photoX, photoY, photoW, photoH, 30);
    context.stroke();

    context.fillStyle = green;
    context.font = `800 30px ${font}`;
    context.fillText("CHYTNUCZ", 540, 1720);

    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Obrázek úlovku se nepodařilo exportovat.")), "image/png");
    });
  } finally {
    photo?.close?.();
  }
}
