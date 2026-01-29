from pydantic import BaseModel
from typing import Optional
from datetime import date


class LineItemParsed(BaseModel):
    """A parsed line item from a receipt."""
    description: str
    unit_price_cents: int
    quantity: int = 1
    category: Optional[str] = None


class TaxLineParsed(BaseModel):
    """A parsed tax line from a receipt."""
    tax_type: str
    amount_cents: int


class OCRResult(BaseModel):
    """Complete parsed result from OCR processing."""
    vendor_name: Optional[str] = None
    receipt_date: Optional[str] = None
    currency: Optional[str] = None
    line_items: list[LineItemParsed] = []
    tax_lines: list[TaxLineParsed] = []
    subtotal_cents: Optional[int] = None
    total_cents: Optional[int] = None
    tip_cents: Optional[int] = None


class Balance(BaseModel):
    """A participant's balance in a trip."""
    participant_id: str
    amount: float  # Positive = owed money, Negative = owes money


class Settlement(BaseModel):
    """A payment from one participant to another."""
    from_id: str
    to_id: str
    amount: float


class ExchangeRateResponse(BaseModel):
    """Response for exchange rate queries."""
    rate: float
    source: str
    cached: bool


class ExchangeRateCreate(BaseModel):
    """Request body for creating a manual exchange rate override."""
    from_currency: str
    to_currency: str
    rate: float
    date: date


class OCRParseRequest(BaseModel):
    """Request body for OCR parsing with base64 image."""
    image_base64: str
    media_type: str = "image/jpeg"
