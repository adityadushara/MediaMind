import sharp from "sharp";
import crypto from "crypto";

export interface BoundingBoxNorm {
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
}

export interface ImageMetadata {
  original_width: number;
  original_height: number;
  oriented_width: number;
  oriented_height: number;
  format: string;
  orientation_corrected: boolean;
}

export class CVService {
  /**
   * Computes SHA-256 hash of a buffer.
   */
  static computeSha256(buffer: Buffer): string {
    return crypto.createHash("sha256").update(buffer).digest("hex");
  }

  /**
   * Detects an image MIME type from the actual file bytes.
   * Upload validation must never trust the client-provided filename/type.
   */
  static detectImageMime(buffer: Buffer): string | null {
    if (!buffer || buffer.length < 12) return null;

    // JPEG
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return "image/jpeg";
    }
    // PNG
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return "image/png";
    }
    // GIF
    if (buffer.subarray(0, 3).toString("ascii") === "GIF") {
      return "image/gif";
    }
    // BMP
    if (buffer.subarray(0, 2).toString("ascii") === "BM") {
      return "image/bmp";
    }
    // WEBP: RIFF....WEBP
    if (
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    ) {
      return "image/webp";
    }
    // AVIF / HEIC family: ISO BMFF with an ftyp box
    if (buffer.subarray(4, 8).toString("ascii") === "ftyp") {
      const brand = buffer.subarray(8, 12).toString("ascii").toLowerCase();
      if (brand.startsWith("avif") || brand.startsWith("avis")) return "image/avif";
      if (
        brand.startsWith("heic") ||
        brand.startsWith("heix") ||
        brand.startsWith("hevc") ||
        brand.startsWith("mif1")
      ) {
        return "image/heic";
      }
    }
    return null;
  }

  /**
   * Loads image buffer, applies EXIF orientation normalization,
   * converts to clean RGB JPEG/PNG, and extracts dimension metadata.
   */
  static async loadAndOrientImage(
    buffer: Buffer
  ): Promise<{ orientedBuffer: Buffer; metadata: ImageMetadata }> {
    const rawSharp = sharp(buffer);
    const rawMeta = await rawSharp.metadata();

    const rawWidth = rawMeta.width || 0;
    const rawHeight = rawMeta.height || 0;
    const rawFormat = (rawMeta.format || "jpeg").toUpperCase();

    // Auto-rotate according to EXIF orientation and normalize to JPEG
    const pipeline = sharp(buffer).rotate();
    const orientedBuffer = await pipeline.toBuffer();
    const orientedMeta = await sharp(orientedBuffer).metadata();

    const orientedWidth = orientedMeta.width || rawWidth;
    const orientedHeight = orientedMeta.height || rawHeight;

    const metadata: ImageMetadata = {
      original_width: rawWidth,
      original_height: rawHeight,
      oriented_width: orientedWidth,
      oriented_height: orientedHeight,
      format: rawFormat,
      orientation_corrected: rawWidth !== orientedWidth || rawHeight !== orientedHeight,
    };

    return { orientedBuffer, metadata };
  }

  /**
   * Converts pixel coordinates to 0-1000 normalized integer coordinates.
   */
  static normalizeBox(
    boxPx: { x_min: number; y_min: number; x_max: number; y_max: number },
    width: number,
    height: number
  ): BoundingBoxNorm {
    return {
      x_min: Math.max(0, Math.min(1000, Math.round((boxPx.x_min / width) * 1000))),
      y_min: Math.max(0, Math.min(1000, Math.round((boxPx.y_min / height) * 1000))),
      x_max: Math.max(0, Math.min(1000, Math.round((boxPx.x_max / width) * 1000))),
      y_max: Math.max(0, Math.min(1000, Math.round((boxPx.y_max / height) * 1000))),
    };
  }

  /**
   * Converts 0-1000 normalized coordinates into clamped pixel coordinates.
   */
  static denormalizeBox(
    boxNorm: BoundingBoxNorm,
    width: number,
    height: number
  ): { left: number; top: number; width: number; height: number } {
    let left = Math.round((boxNorm.x_min / 1000) * width);
    let top = Math.round((boxNorm.y_min / 1000) * height);
    let right = Math.round((boxNorm.x_max / 1000) * width);
    let bottom = Math.round((boxNorm.y_max / 1000) * height);

    left = Math.max(0, Math.min(width - 1, left));
    top = Math.max(0, Math.min(height - 1, top));
    right = Math.max(left + 1, Math.min(width, right));
    bottom = Math.max(top + 1, Math.min(height, bottom));

    return {
      left,
      top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    };
  }

  /**
   * Validates bounding box is in range [0, 1000] with positive area.
   */
  static validateBoundingBox(box?: Partial<BoundingBoxNorm> | null): boolean {
    if (!box || typeof box !== "object") return false;
    const { x_min, y_min, x_max, y_max } = box;
    if (
      typeof x_min !== "number" ||
      typeof y_min !== "number" ||
      typeof x_max !== "number" ||
      typeof y_max !== "number"
    ) {
      return false;
    }
    if (!(x_min >= 0 && x_min < x_max && x_max <= 1000)) return false;
    if (!(y_min >= 0 && y_min < y_max && y_max <= 1000)) return false;
    return (x_max - x_min) * (y_max - y_min) > 0;
  }

  /**
   * Generates a high-quality cropped buffer using normalized coordinates.
   */
  static async generateCrop(
    imageBuffer: Buffer,
    boxNorm: BoundingBoxNorm,
    format: "jpeg" | "png" | "webp" = "jpeg"
  ): Promise<{ cropBuffer: Buffer; width: number; height: number }> {
    const meta = await sharp(imageBuffer).metadata();
    const width = meta.width || 1000;
    const height = meta.height || 1000;

    const extractRegion = this.denormalizeBox(boxNorm, width, height);

    let pipeline = sharp(imageBuffer).extract(extractRegion);
    if (format === "jpeg") {
      pipeline = pipeline.jpeg({ quality: 85 });
    } else if (format === "webp") {
      pipeline = pipeline.webp({ quality: 85 });
    }

    const cropBuffer = await pipeline.toBuffer();
    return {
      cropBuffer,
      width: extractRegion.width,
      height: extractRegion.height,
    };
  }
}
