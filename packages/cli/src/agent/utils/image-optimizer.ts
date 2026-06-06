import sharp from "sharp";

const DEFAULT_MAX_LONG_EDGE = 2048;
const DEFAULT_QUALITY = 80;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export interface OptimizeImageOptions {
  maxBytes?: number;
  maxLongEdge?: number;
  quality?: number;
  preserveAnimatedGif?: boolean;
}

export interface OptimizedImage {
  buffer: Buffer;
  mimeType: string;
  originalBytes: number;
  optimizedBytes: number;
  wasOptimized: boolean;
}

function isAnimatedGif(buffer: Buffer, mimeType: string): boolean {
  if (mimeType !== "image/gif") return false;
  // Check for multiple GIF frames — if more than one Image Descriptor (0x2C), likely animated
  let frameCount = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 0x2c) frameCount++;
    if (frameCount > 1) return true;
  }
  return false;
}

function getOutputFormat(mimeType: string): { format: keyof sharp.FormatEnum; mime: string } | null {
  switch (mimeType) {
    case "image/heic":
    case "image/heif":
      return { format: "jpeg", mime: "image/jpeg" };
    case "image/jpeg":
      return { format: "jpeg", mime: "image/jpeg" };
    case "image/png":
      return { format: "png", mime: "image/png" };
    case "image/webp":
      return { format: "webp", mime: "image/webp" };
    default:
      return null;
  }
}

export async function optimizeImageForModel(
  input: Buffer,
  mimeType: string,
  options?: OptimizeImageOptions,
): Promise<OptimizedImage> {
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxLongEdge = options?.maxLongEdge ?? DEFAULT_MAX_LONG_EDGE;
  const quality = options?.quality ?? DEFAULT_QUALITY;
  const preserveAnimatedGif = options?.preserveAnimatedGif ?? true;

  const originalBytes = input.length;

  // If already under limit and no resize needed, check metadata to decide
  if (originalBytes <= maxBytes) {
    try {
      const meta = await sharp(input).metadata();
      // Already small enough and fits within maxLongEdge — skip processing
      if (
        (meta.width ?? 0) <= maxLongEdge &&
        (meta.height ?? 0) <= maxLongEdge &&
        mimeType !== "image/heic" &&
        mimeType !== "image/heif"
      ) {
        return {
          buffer: input,
          mimeType,
          originalBytes,
          optimizedBytes: originalBytes,
          wasOptimized: false,
        };
      }
    } catch {
      // Corrupted metadata — fall through to attempt processing
    }
  }

  // Skip animated GIF to avoid losing frames
  if (preserveAnimatedGif && isAnimatedGif(input, mimeType)) {
    if (originalBytes > maxBytes) {
      throw new Error(`Animated GIF is too large (${Math.ceil(originalBytes / 1024 / 1024)} MB). Max size is ${Math.ceil(maxBytes / 1024 / 1024)} MB.`);
    }
    return {
      buffer: input,
      mimeType,
      originalBytes,
      optimizedBytes: originalBytes,
      wasOptimized: false,
    };
  }

  try {
    const outputFormat = getOutputFormat(mimeType);
    if (!outputFormat) {
      // Unsupported format for optimization — return as-is
      if (originalBytes > maxBytes) {
        throw new Error(`Image is too large (${Math.ceil(originalBytes / 1024 / 1024)} MB). Max size is ${Math.ceil(maxBytes / 1024 / 1024)} MB.`);
      }
      return {
        buffer: input,
        mimeType,
        originalBytes,
        optimizedBytes: originalBytes,
        wasOptimized: false,
      };
    }

    let pipeline = sharp(input, { limitInputPixels: 268402689 }) // ~16384x16384 safety
      .rotate() // auto-rotate by EXIF
      .resize({
        width: maxLongEdge,
        height: maxLongEdge,
        fit: "inside",
        withoutEnlargement: true,
      })
      .withMetadata({}); // strip EXIF/metadata for privacy + size

    switch (outputFormat.format) {
      case "jpeg":
        pipeline = pipeline.jpeg({ quality, progressive: true });
        break;
      case "png":
        pipeline = pipeline.png({ compressionLevel: 9, palette: true });
        break;
      case "webp":
        pipeline = pipeline.webp({ quality });
        break;
    }

    const optimized = await pipeline.toBuffer();
    const optimizedBytes = optimized.length;

    // If optimized is larger than original (rare but possible with small images), keep original
    if (optimizedBytes >= originalBytes) {
      if (originalBytes > maxBytes) {
        throw new Error(`Image is too large (${Math.ceil(originalBytes / 1024 / 1024)} MB). Max size is ${Math.ceil(maxBytes / 1024 / 1024)} MB.`);
      }
      return {
        buffer: input,
        mimeType,
        originalBytes,
        optimizedBytes: originalBytes,
        wasOptimized: false,
      };
    }

    if (optimizedBytes > maxBytes) {
      // Try one more pass with lower quality for JPEG/WebP
      if (outputFormat.format === "jpeg" || outputFormat.format === "webp") {
        const reducedQ = Math.max(quality - 20, 40);
        let secondPipeline = sharp(input, { limitInputPixels: 268402689 })
          .rotate()
          .resize({ width: maxLongEdge, height: maxLongEdge, fit: "inside", withoutEnlargement: true })
          .withMetadata({});

        if (outputFormat.format === "jpeg") {
          secondPipeline = secondPipeline.jpeg({ quality: reducedQ, progressive: true });
        } else {
          secondPipeline = secondPipeline.webp({ quality: reducedQ });
        }

        const secondPass = await secondPipeline.toBuffer();
        if (secondPass.length <= maxBytes) {
          return {
            buffer: secondPass,
            mimeType: outputFormat.mime,
            originalBytes,
            optimizedBytes: secondPass.length,
            wasOptimized: true,
          };
        }
      }

      throw new Error(
        `Image is too large even after compression (${Math.ceil(optimizedBytes / 1024 / 1024)} MB). Max size is ${Math.ceil(maxBytes / 1024 / 1024)} MB.`,
      );
    }

    return {
      buffer: optimized,
      mimeType: outputFormat.mime,
      originalBytes,
      optimizedBytes,
      wasOptimized: true,
    };
  } catch (err) {
    // If sharp fails (corrupted image, unsupported codec), fall back to original
    if (originalBytes > maxBytes) {
      throw new Error(`Image is too large (${Math.ceil(originalBytes / 1024 / 1024)} MB). Max size is ${Math.ceil(maxBytes / 1024 / 1024)} MB.`);
    }
    return {
      buffer: input,
      mimeType,
      originalBytes,
      optimizedBytes: originalBytes,
      wasOptimized: false,
    };
  }
}
