from pydantic import BaseModel
from typing import Optional
from datetime import date


class LineItemParsed(BaseModel):
    """A parsed line item from a receipt."""
    description: str
    amount: float
    category: Optional[str] = None


class TaxLineParsed(BaseModel):
    """A parsed tax line from a receipt."""
    description: str
    amount: float


class OCRResult(BaseModel):
    """Complete parsed result from OCR processing."""
    vendor: Optional[str] = None
    date: Optional[str] = None
    currency: Optional[str] = None
    line_items: list[LineItemParsed] = []
    tax_lines: list[TaxLineParsed] = []
    subtotal: Optional[float] = None
    total: Optional[float] = None
    tip: Optional[float] = None


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
