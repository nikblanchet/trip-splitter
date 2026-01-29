from datetime import date
from fastapi import APIRouter, HTTPException, Query

from ..models import ExchangeRateResponse, ExchangeRateCreate
from ..services.exchange import fetch_rate, save_rate

router = APIRouter(prefix="/exchange-rate", tags=["Exchange Rates"])


@router.get("", response_model=ExchangeRateResponse)
async def get_exchange_rate(
    from_currency: str = Query(..., alias="from", description="Source currency code (e.g., MXN)"),
    to_currency: str = Query(..., alias="to", description="Target currency code (e.g., USD)"),
    rate_date: date = Query(..., alias="date", description="Date for the exchange rate"),
) -> ExchangeRateResponse:
    """
    Get an exchange rate for a specific date.

    Checks cache first, then fetches from frankfurter.app API if not cached.
    """
    try:
        rate, source, cached = await fetch_rate(from_currency, to_currency, rate_date)
        return ExchangeRateResponse(rate=rate, source=source, cached=cached)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch exchange rate: {str(e)}")


@router.post("", response_model=ExchangeRateResponse)
async def create_exchange_rate(request: ExchangeRateCreate) -> ExchangeRateResponse:
    """
    Manually set an exchange rate override.

    This will save the rate to the cache, overwriting any existing rate.
    """
    try:
        result = await save_rate(
            from_currency=request.from_currency,
            to_currency=request.to_currency,
            rate=request.rate,
            rate_date=request.date,
            source="manual",
        )

        if result:
            return ExchangeRateResponse(rate=request.rate, source="manual", cached=False)
        else:
            # If Supabase is not configured, just return the rate without caching
            return ExchangeRateResponse(rate=request.rate, source="manual", cached=False)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save exchange rate: {str(e)}")
