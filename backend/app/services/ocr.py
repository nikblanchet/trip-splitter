import json
import base64
from anthropic import AsyncAnthropic

from ..config import get_settings
from ..models import OCRResult, LineItemParsed, TaxLineParsed


RECEIPT_EXTRACTION_PROMPT = """Analyze this receipt image and extract the following information in JSON format:

{
  "vendor": "Name of the store/restaurant",
  "date": "Date in YYYY-MM-DD format if visible",
  "currency": "Currency code (USD, MXN, EUR, etc.) - infer from symbols or context",
  "line_items": [
    {
      "description": "Item description",
      "amount": 12.99,
      "category": "One of: food, drink, alcohol, transportation, accommodation, activity, shopping, other"
    }
  ],
  "tax_lines": [
    {
      "description": "Tax type (e.g., 'Sales Tax', 'IVA', 'VAT')",
      "amount": 1.50
    }
  ],
  "subtotal": 25.00,
  "total": 26.50,
  "tip": null
}

Important:
- All amounts should be numeric values, not strings
- If a field is not visible or cannot be determined, use null
- For line items, try to categorize each item based on its description
- Include all individual items, not grouped totals
- If tip is included, extract it separately
- Return ONLY the JSON, no additional text"""


async def parse_receipt_image(
    image_data: str | bytes,
    media_type: str = "image/jpeg"
) -> OCRResult:
    """
    Parse a receipt image using Claude Vision.

    Args:
        image_data: Base64 encoded image string or raw bytes
        media_type: MIME type of the image (image/jpeg, image/png, etc.)

    Returns:
        OCRResult with extracted receipt data
    """
    settings = get_settings()
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)

    # Ensure image_data is base64 string
    if isinstance(image_data, bytes):
        image_base64 = base64.b64encode(image_data).decode("utf-8")
    else:
        image_base64 = image_data

    message = await client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_base64,
                        },
                    },
                    {
                        "type": "text",
                        "text": RECEIPT_EXTRACTION_PROMPT,
                    },
                ],
            }
        ],
    )

    # Extract the text content from the response
    response_text = message.content[0].text

    # Parse JSON response
    try:
        # Try to find JSON in the response (in case there's extra text)
        json_start = response_text.find("{")
        json_end = response_text.rfind("}") + 1
        if json_start != -1 and json_end > json_start:
            json_str = response_text[json_start:json_end]
            data = json.loads(json_str)
        else:
            data = json.loads(response_text)
    except json.JSONDecodeError:
        # If parsing fails, return empty result
        return OCRResult()

    # Helper to convert dollars to cents
    def to_cents(amount) -> int:
        if amount is None:
            return 0
        return round(float(amount) * 100)

    # Convert to Pydantic models
    line_items = [
        LineItemParsed(
            description=item.get("description", ""),
            unit_price_cents=to_cents(item.get("amount")),
            quantity=1,
            category=item.get("category")
        )
        for item in data.get("line_items", [])
    ]

    tax_lines = [
        TaxLineParsed(
            tax_type=tax.get("description", "Tax"),
            amount_cents=to_cents(tax.get("amount"))
        )
        for tax in data.get("tax_lines", [])
    ]

    return OCRResult(
        vendor_name=data.get("vendor"),
        receipt_date=data.get("date"),
        currency=data.get("currency"),
        line_items=line_items,
        tax_lines=tax_lines,
        subtotal_cents=to_cents(data.get("subtotal")) if data.get("subtotal") is not None else None,
        total_cents=to_cents(data.get("total")) if data.get("total") is not None else None,
        tip_cents=to_cents(data.get("tip")) if data.get("tip") is not None else None,
    )
