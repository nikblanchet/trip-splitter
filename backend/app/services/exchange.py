from datetime import date
from typing import Optional
import httpx

from ..config import get_settings


async def get_supabase_headers() -> dict[str, str]:
    """Get headers for Supabase REST API calls."""
    settings = get_settings()
    return {
        "apikey": settings.supabase_service_key,
        "Authorization": f"Bearer {settings.supabase_service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


async def get_cached_rate(
    from_currency: str,
    to_currency: str,
    rate_date: date
) -> Optional[dict]:
    """
    Check Supabase cache for an existing exchange rate.

    Args:
        from_currency: Source currency code
        to_currency: Target currency code
        rate_date: Date for the rate

    Returns:
        Cached rate data if found, None otherwise
    """
    settings = get_settings()

    if not settings.supabase_url or not settings.supabase_service_key:
        return None

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{settings.supabase_url}/rest/v1/exchange_rate_cache",
            headers=await get_supabase_headers(),
            params={
                "from_currency": f"eq.{from_currency.upper()}",
                "to_currency": f"eq.{to_currency.upper()}",
                "rate_date": f"eq.{rate_date.isoformat()}",
                "select": "*",
            },
        )

        if response.status_code == 200:
            data = response.json()
            if data:
                return data[0]

    return None


async def save_rate(
    from_currency: str,
    to_currency: str,
    rate: float,
    rate_date: date,
    source: str
) -> Optional[dict]:
    """
    Save an exchange rate to the Supabase cache.

    Args:
        from_currency: Source currency code
        to_currency: Target currency code
        rate: The exchange rate
        rate_date: Date for the rate
        source: Where the rate came from (e.g., 'frankfurter', 'manual')

    Returns:
        The saved rate data, or None if save failed
    """
    settings = get_settings()

    if not settings.supabase_url or not settings.supabase_service_key:
        return None

    async with httpx.AsyncClient() as client:
        # Use upsert to handle duplicates
        response = await client.post(
            f"{settings.supabase_url}/rest/v1/exchange_rate_cache",
            headers={
                **await get_supabase_headers(),
                "Prefer": "resolution=merge-duplicates,return=representation",
            },
            json={
                "from_currency": from_currency.upper(),
                "to_currency": to_currency.upper(),
                "rate": rate,
                "rate_date": rate_date.isoformat(),
                "source": source,
            },
        )

        if response.status_code in (200, 201):
            data = response.json()
            if data:
                return data[0] if isinstance(data, list) else data

    return None


async def fetch_rate_from_api(
    from_currency: str,
    to_currency: str,
    rate_date: date
) -> Optional[float]:
    """
    Fetch exchange rate from frankfurter.app API.

    Args:
        from_currency: Source currency code
        to_currency: Target currency code
        rate_date: Date for the rate

    Returns:
        The exchange rate, or None if fetch failed
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"https://api.frankfurter.app/{rate_date.isoformat()}",
                params={
                    "from": from_currency.upper(),
                    "to": to_currency.upper(),
                },
                timeout=10.0,
            )

            if response.status_code == 200:
                data = response.json()
                rates = data.get("rates", {})
                return rates.get(to_currency.upper())
        except httpx.RequestError:
            pass

    return None


async def fetch_rate(
    from_currency: str,
    to_currency: str,
    rate_date: date
) -> tuple[float, str, bool]:
    """
    Get exchange rate, trying cache first, then API.

    Args:
        from_currency: Source currency code
        to_currency: Target currency code
        rate_date: Date for the rate

    Returns:
        Tuple of (rate, source, cached)

    Raises:
        ValueError: If rate cannot be fetched
    """
    # Check cache first
    cached = await get_cached_rate(from_currency, to_currency, rate_date)
    if cached:
        return cached["rate"], cached["source"], True

    # Fetch from API
    rate = await fetch_rate_from_api(from_currency, to_currency, rate_date)
    if rate is not None:
        # Save to cache
        await save_rate(from_currency, to_currency, rate, rate_date, "frankfurter")
        return rate, "frankfurter", False

    raise ValueError(f"Could not fetch exchange rate for {from_currency} to {to_currency}")
