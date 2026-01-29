import base64
from fastapi import APIRouter, UploadFile, File, HTTPException

from ..models import OCRResult, OCRParseRequest
from ..services.ocr import parse_receipt_image

router = APIRouter(prefix="/ocr", tags=["OCR"])


@router.post("/parse", response_model=OCRResult)
async def parse_receipt(
    file: UploadFile | None = File(None),
    request: OCRParseRequest | None = None,
) -> OCRResult:
    """
    Parse a receipt image using Claude Vision OCR.

    Accepts either:
    - A file upload (multipart/form-data)
    - A JSON body with base64-encoded image

    Returns structured receipt data including vendor, date, line items, etc.
    """
    if file is not None:
        # Handle file upload
        content = await file.read()
        media_type = file.content_type or "image/jpeg"

        try:
            result = await parse_receipt_image(content, media_type)
            return result
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")

    elif request is not None:
        # Handle base64 JSON request
        try:
            result = await parse_receipt_image(
                request.image_base64,
                request.media_type
            )
            return result
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")

    else:
        raise HTTPException(
            status_code=400,
            detail="Must provide either a file upload or base64 image data"
        )


@router.post("/parse/upload", response_model=OCRResult)
async def parse_receipt_upload(file: UploadFile = File(...)) -> OCRResult:
    """
    Parse a receipt image from file upload.

    This endpoint is specifically for multipart/form-data file uploads.
    """
    content = await file.read()
    media_type = file.content_type or "image/jpeg"

    try:
        result = await parse_receipt_image(content, media_type)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")


@router.post("/parse/base64", response_model=OCRResult)
async def parse_receipt_base64(request: OCRParseRequest) -> OCRResult:
    """
    Parse a receipt image from base64-encoded data.

    This endpoint is specifically for JSON requests with base64 image data.
    """
    try:
        result = await parse_receipt_image(
            request.image_base64,
            request.media_type
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")
