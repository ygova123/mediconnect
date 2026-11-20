const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 350 * 1024;
const MAX_IMAGE_COUNT = 4;

export function validateImage(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "Choose JPG, PNG, or WebP images.";
  if (file.size > MAX_SOURCE_BYTES) return "Each original image must be 15 MB or smaller.";
  return "";
}

export function checkImageCount(existingCount, selectedCount) {
  return existingCount + selectedCount <= MAX_IMAGE_COUNT
    ? ""
    : `You can save up to ${MAX_IMAGE_COUNT} compressed images per hospital.`;
}

export async function compressHospitalImage(file) {
  const validationError = validateImage(file);
  if (validationError) throw new Error(validationError);

  const image = await decodeImage(file);
  const maxSide = 1280;
  const initialScale = Math.min(1, maxSide / Math.max(image.width, image.height));
  let scale = initialScale;
  let quality = 0.8;
  let output;

  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("This browser cannot process the selected image.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      output = await canvasToBlob(canvas, quality);

      if (output.size <= MAX_OUTPUT_BYTES) return await blobToDataUrl(output);
      if (quality > 0.52) quality -= 0.1;
      else scale *= 0.78;
    }
  } finally {
    if ("close" in image && typeof image.close === "function") image.close();
  }

  throw new Error("This image could not be compressed enough. Choose a smaller image.");
}

async function decodeImage(file) {
  if ("createImageBitmap" in window) return createImageBitmap(file, { imageOrientation: "from-image" });
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not encode the selected image."));
    }, "image/jpeg", quality);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read the compressed image."));
    reader.readAsDataURL(blob);
  });
}
