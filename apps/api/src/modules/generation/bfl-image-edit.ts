import sharp from "sharp";

export type ImageSize = { width: number; height: number };

export type PreparedBflImageEditPair = {
  image: Buffer;
  mask?: Buffer;
  imageSize: ImageSize | null;
  maskSize: ImageSize | null;
  outputImageSize: ImageSize | null;
  outputMaskSize: ImageSize | null;
  resized: boolean;
  normalizedMask: boolean;
};

const DEFAULT_BFL_MAX_INPUT_MEGAPIXELS = 4;
const DEFAULT_BFL_MAX_INPUT_SIDE = 2048;
const MIN_BFL_INPUT_SIDE = 64;

function numberParam(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function evenDimension(value: number) {
  return Math.max(MIN_BFL_INPUT_SIDE, Math.floor(value / 2) * 2);
}

function targetSizeForBflInput(
  size: ImageSize,
  params: Record<string, unknown>,
): ImageSize {
  const maxMegapixels = numberParam(
    params.maxInputMegapixels ?? params.max_input_megapixels,
    DEFAULT_BFL_MAX_INPUT_MEGAPIXELS,
    0.25,
    16,
  );
  const maxSide = numberParam(
    params.maxInputSide ?? params.max_input_side,
    DEFAULT_BFL_MAX_INPUT_SIDE,
    MIN_BFL_INPUT_SIDE,
    4096,
  );
  const maxPixels = maxMegapixels * 1024 * 1024;
  const scale = Math.min(
    1,
    maxSide / size.width,
    maxSide / size.height,
    Math.sqrt(maxPixels / (size.width * size.height)),
  );
  return {
    width: evenDimension(size.width * scale),
    height: evenDimension(size.height * scale),
  };
}

function sameSize(a: ImageSize | null, b: ImageSize | null) {
  return Boolean(a && b && a.width === b.width && a.height === b.height);
}

async function imageSize(buffer: Buffer): Promise<ImageSize | null> {
  try {
    const metadata = await sharp(buffer, { limitInputPixels: false }).metadata();
    if (!metadata.width || !metadata.height) return null;
    return { width: metadata.width, height: metadata.height };
  } catch {
    return null;
  }
}

export function isBflImageEditParams(params: Record<string, unknown>) {
  return (
    params.apiStyle === "bfl-fill" ||
    params.apiStyle === "bfl-erase" ||
    params.apiStyle === "bfl-image-edit"
  );
}

export async function prepareBflImageEditPair(input: {
  image: Buffer;
  mask?: Buffer;
  params: Record<string, unknown>;
}): Promise<PreparedBflImageEditPair> {
  const imageInputSize = await imageSize(input.image);
  const maskInputSize = input.mask ? await imageSize(input.mask) : null;
  if (input.mask && imageInputSize && maskInputSize && !sameSize(imageInputSize, maskInputSize)) {
    throw new Error(
      `IMAGE_EDIT_MASK_DIMENSIONS_MISMATCH: image=${imageInputSize.width}x${imageInputSize.height} mask=${maskInputSize.width}x${maskInputSize.height}`,
    );
  }

  const targetSize = imageInputSize
    ? targetSizeForBflInput(imageInputSize, input.params)
    : null;
  const resized = Boolean(
    imageInputSize &&
      targetSize &&
      (targetSize.width !== imageInputSize.width ||
        targetSize.height !== imageInputSize.height),
  );
  const normalizeMask = input.params.normalizeMask !== false;

  const image = resized && targetSize
    ? await sharp(input.image, { limitInputPixels: false })
        .resize(targetSize.width, targetSize.height, { fit: "fill" })
        .png({ compressionLevel: 9 })
        .toBuffer()
    : input.image;

  const mask = input.mask
    ? resized && targetSize
      ? await sharp(input.mask, { limitInputPixels: false })
          .resize(targetSize.width, targetSize.height, {
            fit: "fill",
            kernel: "nearest",
          })
          .grayscale()
          .threshold(128)
          .png({ compressionLevel: 9 })
          .toBuffer()
      : normalizeMask
        ? await sharp(input.mask, { limitInputPixels: false })
            .grayscale()
            .threshold(128)
            .png({ compressionLevel: 9 })
            .toBuffer()
        : input.mask
    : undefined;

  return {
    image,
    mask,
    imageSize: imageInputSize,
    maskSize: maskInputSize,
    outputImageSize: await imageSize(image),
    outputMaskSize: mask ? await imageSize(mask) : null,
    resized,
    normalizedMask: Boolean(mask && normalizeMask),
  };
}

export function formatImageSize(size: ImageSize | null) {
  return size ? `${size.width}x${size.height}` : "unknown";
}
