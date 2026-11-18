import io
import logging
from typing import List, Dict, Any, Tuple, Optional
import numpy as np
from PIL import Image, ImageOps
import cv2

from app.core.config import settings

logger = logging.getLogger(__name__)

# Protect against decompression bomb attacks
Image.MAX_IMAGE_PIXELS = 50_000_000


class CVService:
    """
    Dedicated Computer Vision and Image Preprocessing Service.
    Uses Pillow and OpenCV for non-destructive visual validation, orientation correction,
    conservative region proposals, and high-fidelity derivative crop generation.
    """

    @staticmethod
    def load_and_orient_image(image_bytes: bytes) -> Tuple[Image.Image, Dict[str, Any]]:
        """
        Loads image bytes, applies EXIF orientation correction, ensures RGB color space,
        and returns the PIL Image with extraction metadata.
        """
        try:
            raw_img = Image.open(io.BytesIO(image_bytes))
            raw_width, raw_height = raw_img.size
            raw_format = (raw_img.format or "JPEG").upper()
            raw_mode = raw_img.mode

            # Apply EXIF transpose if orientation tag is present
            oriented_img = ImageOps.exif_transpose(raw_img)
            if oriented_img is None:
                oriented_img = raw_img

            # Convert to RGB cleanly
            if oriented_img.mode in ("RGBA", "LA") or (oriented_img.mode == "P" and "transparency" in oriented_img.info):
                background = Image.new("RGB", oriented_img.size, (255, 255, 255))
                alpha_img = oriented_img.convert("RGBA")
                background.paste(alpha_img, mask=alpha_img.split()[3])
                rgb_img = background
            elif oriented_img.mode != "RGB":
                rgb_img = oriented_img.convert("RGB")
            else:
                rgb_img = oriented_img

            metadata = {
                "original_width": raw_width,
                "original_height": raw_height,
                "oriented_width": rgb_img.width,
                "oriented_height": rgb_img.height,
                "original_format": raw_format,
                "original_mode": raw_mode,
                "orientation_corrected": (raw_width, raw_height) != (rgb_img.width, rgb_img.height),
            }
            return rgb_img, metadata

        except Exception as e:
            logger.error(f"Failed to load or orient image: {e}")
            raise ValueError(f"Image could not be parsed or orientation-corrected: {str(e)}")

    @staticmethod
    def resize_for_processing(img: Image.Image, max_dim: Optional[int] = None) -> Tuple[Image.Image, float]:
        """
        Resizes image if its largest dimension exceeds max_dim, preserving exact aspect ratio.
        Returns the (possibly resized) image and scale factor.
        """
        limit = max_dim or settings.MAX_IMAGE_DIMENSION
        w, h = img.size
        max_side = max(w, h)

        if max_side <= limit:
            return img.copy(), 1.0

        scale = limit / max_side
        new_w = max(1, int(w * scale))
        new_h = max(1, int(h * scale))
        resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        return resized, scale

    @staticmethod
    def normalize_box(
        box_px: Tuple[int, int, int, int],
        width: int,
        height: int
    ) -> Dict[str, int]:
        """
        Converts pixel box (x_min, y_min, x_max, y_max) into 0-1000 normalized integer coordinates.
        """
        x_min, y_min, x_max, y_max = box_px
        return {
            "x_min": max(0, min(1000, int(round((x_min / width) * 1000)))),
            "y_min": max(0, min(1000, int(round((y_min / height) * 1000)))),
            "x_max": max(0, min(1000, int(round((x_max / width) * 1000)))),
            "y_max": max(0, min(1000, int(round((y_max / height) * 1000)))),
        }

    @staticmethod
    def denormalize_box(
        box_norm: Dict[str, int],
        width: int,
        height: int
    ) -> Tuple[int, int, int, int]:
        """
        Converts 0-1000 normalized coordinate dict into clamped pixel coordinates (x_min, y_min, x_max, y_max).
        """
        x_min = int(round((box_norm.get("x_min", 0) / 1000.0) * width))
        y_min = int(round((box_norm.get("y_min", 0) / 1000.0) * height))
        x_max = int(round((box_norm.get("x_max", 1000) / 1000.0) * width))
        y_max = int(round((box_norm.get("y_max", 1000) / 1000.0) * height))

        # Clamp to bounds and enforce positive area
        x_min = max(0, min(width - 1, x_min))
        y_min = max(0, min(height - 1, y_min))
        x_max = max(x_min + 1, min(width, x_max))
        y_max = max(y_min + 1, min(height, y_max))

        return x_min, y_min, x_max, y_max

    @staticmethod
    def validate_bounding_box(box: Optional[Dict[str, Any]]) -> bool:
        """
        Validates that a bounding box dictionary has valid normalized bounds in [0, 1000]
        with x_min < x_max and y_min < y_max.
        """
        if not box or not isinstance(box, dict):
            return False

        try:
            x_min = int(box["x_min"])
            y_min = int(box["y_min"])
            x_max = int(box["x_max"])
            y_max = int(box["y_max"])
        except (KeyError, ValueError, TypeError):
            return False

        if not (0 <= x_min < x_max <= 1000):
            return False
        if not (0 <= y_min < y_max <= 1000):
            return False

        # Area must be non-zero
        area = (x_max - x_min) * (y_max - y_min)
        return area > 0

    @staticmethod
    def detect_candidate_regions(img: Image.Image) -> List[Dict[str, int]]:
        """
        Proposes candidate media regions using OpenCV contour analysis and geometric filtering.
        Detects covers, thumbnails, cards, and video player rectangles without heavy models.
        Returns list of bounding boxes normalized to [0, 1000].
        """
        width, height = img.size
        total_area = width * height
        min_area = total_area * settings.MIN_REGION_AREA_PERCENT
        max_area = total_area * 0.98

        # Convert PIL Image to OpenCV BGR numpy array
        np_img = np.array(img)
        gray = cv2.cvtColor(np_img, cv2.COLOR_RGB2GRAY)

        # Bilateral blur preserves prominent edges while smoothing texture noise
        blurred = cv2.bilateralFilter(gray, d=9, sigmaColor=75, sigmaSpace=75)

        # Morphological gradient to enhance card and cover borders
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        morph = cv2.morphologyEx(blurred, cv2.MORPH_GRADIENT, kernel)

        # Adaptive thresholding
        thresh = cv2.adaptiveThreshold(
            morph,
            255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            blockSize=15,
            C=4
        )

        # Dilate to connect broken contours along borders
        dilated = cv2.dilate(thresh, kernel, iterations=2)

        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        candidate_boxes_px: List[Tuple[int, int, int, int]] = []

        for cnt in contours:
            x, y, w, h = cv2.boundingRect(cnt)
            area = w * h

            if area < min_area or area > max_area:
                continue

            aspect_ratio = w / float(h)
            # Media items (books, movie posters, YouTube thumbnails, courses) typically range 0.25 to 3.5
            if 0.25 <= aspect_ratio <= 3.5:
                candidate_boxes_px.append((x, y, x + w, y + h))

        # Perform Non-Maximum Suppression / deduplication on proposed boxes
        if not candidate_boxes_px:
            return []

        # Convert to cv2 NMS format: [x, y, w, h] and scores based on area
        boxes_for_nms = [[x1, y1, x2 - x1, y2 - y1] for x1, y1, x2, y2 in candidate_boxes_px]
        scores = [float(b[2] * b[3]) for b in boxes_for_nms]

        indices = cv2.dnn.NMSBoxes(
            bboxes=boxes_for_nms,
            scores=scores,
            score_threshold=0.0,
            nms_threshold=0.4
        )

        normalized_proposals: List[Dict[str, int]] = []
        if len(indices) > 0:
            for idx in indices.flatten():
                x1, y1, x2, y2 = candidate_boxes_px[idx]
                norm_box = CVService.normalize_box((x1, y1, x2, y2), width, height)
                normalized_proposals.append(norm_box)

        # Sort by vertical layout (top-to-bottom, left-to-right)
        normalized_proposals.sort(key=lambda b: (b["y_min"], b["x_min"]))
        return normalized_proposals

    @staticmethod
    def generate_crop(
        img: Image.Image,
        bounding_box_norm: Dict[str, int],
        image_format: str = "JPEG",
        quality: int = 85
    ) -> Tuple[bytes, int, int]:
        """
        Non-destructively generates a crop of img at the specified normalized coordinates.
        Returns (crop_bytes, crop_width, crop_height).
        """
        width, height = img.size
        x1, y1, x2, y2 = CVService.denormalize_box(bounding_box_norm, width, height)

        crop = img.crop((x1, y1, x2, y2))
        crop_w, crop_h = crop.size

        buffer = io.BytesIO()
        crop.save(buffer, format=image_format, quality=quality)
        crop_bytes = buffer.getvalue()

        return crop_bytes, crop_w, crop_h

    @staticmethod
    def encode_image_for_gemini(img: Image.Image) -> Tuple[bytes, str]:
        """
        Encodes preprocessed PIL Image to JPEG bytes for Gemini API consumption.
        """
        buffer = io.BytesIO()
        img.save(buffer, format="JPEG", quality=88, optimize=True)
        return buffer.getvalue(), "image/jpeg"
