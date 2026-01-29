"""Tests for exchange rate service."""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from datetime import date
import httpx

from app.services.exchange import (
    get_cached_rate,
    save_rate,
    fetch_rate_from_api,
    fetch_rate,
)


class TestGetCachedRate:
    """Tests for the get_cached_rate function."""

    @pytest.fixture
    def mock_settings(self):
        """Mock settings with valid Supabase config."""
        with patch("app.services.exchange.get_settings") as mock:
            settings = MagicMock()
            settings.supabase_url = "https://test.supabase.co"
            settings.supabase_service_key = "test-service-key"
            mock.return_value = settings
            yield mock

    @pytest.mark.asyncio
    async def test_returns_cached_rate_when_found(self, mock_settings):
        """Test that cached rate is returned when found in Supabase."""
        cached_data = {
            "id": 1,
            "from_currency": "USD",
            "to_currency": "MXN",
            "rate": 17.5,
            "rate_date": "2024-01-15",
            "source": "frankfurter",
        }

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = [cached_data]

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            result = await get_cached_rate("USD", "MXN", date(2024, 1, 15))

            assert result == cached_data
            assert result["rate"] == 17.5

    @pytest.mark.asyncio
    async def test_returns_none_when_not_found(self, mock_settings):
        """Test that None is returned when no cached rate exists."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = []  # Empty result

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            result = await get_cached_rate("USD", "EUR", date(2024, 1, 15))

            assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_when_supabase_not_configured(self):
        """Test that None is returned when Supabase is not configured."""
        with patch("app.services.exchange.get_settings") as mock:
            settings = MagicMock()
            settings.supabase_url = ""
            settings.supabase_service_key = ""
            mock.return_value = settings

            result = await get_cached_rate("USD", "MXN", date(2024, 1, 15))

            assert result is None

    @pytest.mark.asyncio
    async def test_normalizes_currency_to_uppercase(self, mock_settings):
        """Test that currency codes are normalized to uppercase."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = []

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            await get_cached_rate("usd", "mxn", date(2024, 1, 15))

            # Verify the API was called with uppercase currencies
            call_kwargs = mock_client.get.call_args.kwargs
            assert call_kwargs["params"]["from_currency"] == "eq.USD"
            assert call_kwargs["params"]["to_currency"] == "eq.MXN"

    @pytest.mark.asyncio
    async def test_returns_none_on_non_200_status(self, mock_settings):
        """Test that None is returned on non-200 status code."""
        mock_response = MagicMock()
        mock_response.status_code = 500

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            result = await get_cached_rate("USD", "MXN", date(2024, 1, 15))

            assert result is None


class TestSaveRate:
    """Tests for the save_rate function."""

    @pytest.fixture
    def mock_settings(self):
        """Mock settings with valid Supabase config."""
        with patch("app.services.exchange.get_settings") as mock:
            settings = MagicMock()
            settings.supabase_url = "https://test.supabase.co"
            settings.supabase_service_key = "test-service-key"
            mock.return_value = settings
            yield mock

    @pytest.mark.asyncio
    async def test_saves_rate_to_supabase(self, mock_settings):
        """Test that rate is saved to Supabase."""
        saved_data = {
            "id": 1,
            "from_currency": "USD",
            "to_currency": "MXN",
            "rate": 17.5,
            "rate_date": "2024-01-15",
            "source": "frankfurter",
        }

        mock_response = MagicMock()
        mock_response.status_code = 201
        mock_response.json.return_value = [saved_data]

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            result = await save_rate("USD", "MXN", 17.5, date(2024, 1, 15), "frankfurter")

            assert result == saved_data

            # Verify the POST was called with correct data
            call_kwargs = mock_client.post.call_args.kwargs
            assert call_kwargs["json"]["from_currency"] == "USD"
            assert call_kwargs["json"]["to_currency"] == "MXN"
            assert call_kwargs["json"]["rate"] == 17.5
            assert call_kwargs["json"]["source"] == "frankfurter"

    @pytest.mark.asyncio
    async def test_returns_none_when_supabase_not_configured(self):
        """Test that None is returned when Supabase is not configured."""
        with patch("app.services.exchange.get_settings") as mock:
            settings = MagicMock()
            settings.supabase_url = ""
            settings.supabase_service_key = ""
            mock.return_value = settings

            result = await save_rate("USD", "MXN", 17.5, date(2024, 1, 15), "frankfurter")

            assert result is None

    @pytest.mark.asyncio
    async def test_handles_upsert_with_200_status(self, mock_settings):
        """Test that upsert returning 200 (update) works correctly."""
        updated_data = {
            "id": 1,
            "from_currency": "USD",
            "to_currency": "MXN",
            "rate": 18.0,
            "rate_date": "2024-01-15",
            "source": "frankfurter",
        }

        mock_response = MagicMock()
        mock_response.status_code = 200  # Update case
        mock_response.json.return_value = [updated_data]

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            result = await save_rate("USD", "MXN", 18.0, date(2024, 1, 15), "frankfurter")

            assert result == updated_data

    @pytest.mark.asyncio
    async def test_returns_none_on_failed_save(self, mock_settings):
        """Test that None is returned when save fails."""
        mock_response = MagicMock()
        mock_response.status_code = 500

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            result = await save_rate("USD", "MXN", 17.5, date(2024, 1, 15), "frankfurter")

            assert result is None

    @pytest.mark.asyncio
    async def test_normalizes_currency_to_uppercase(self, mock_settings):
        """Test that currency codes are normalized to uppercase on save."""
        mock_response = MagicMock()
        mock_response.status_code = 201
        mock_response.json.return_value = [{"id": 1}]

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            await save_rate("usd", "mxn", 17.5, date(2024, 1, 15), "frankfurter")

            # Verify currencies were uppercased
            call_kwargs = mock_client.post.call_args.kwargs
            assert call_kwargs["json"]["from_currency"] == "USD"
            assert call_kwargs["json"]["to_currency"] == "MXN"


class TestFetchRateFromApi:
    """Tests for the fetch_rate_from_api function."""

    @pytest.mark.asyncio
    async def test_returns_rate_on_success(self):
        """Test that rate is returned on successful API call."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "amount": 1.0,
            "base": "USD",
            "date": "2024-01-15",
            "rates": {"MXN": 17.5},
        }

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            result = await fetch_rate_from_api("USD", "MXN", date(2024, 1, 15))

            assert result == 17.5

    @pytest.mark.asyncio
    async def test_returns_none_on_network_error(self):
        """Test that None is returned on network error."""
        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(side_effect=httpx.RequestError("Connection failed"))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            result = await fetch_rate_from_api("USD", "MXN", date(2024, 1, 15))

            assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_on_timeout(self):
        """Test that None is returned on request timeout."""
        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(side_effect=httpx.TimeoutException("Request timed out"))
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            result = await fetch_rate_from_api("USD", "MXN", date(2024, 1, 15))

            assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_on_invalid_response(self):
        """Test that None is returned when response doesn't contain expected rate."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "amount": 1.0,
            "base": "USD",
            "date": "2024-01-15",
            "rates": {},  # Missing the requested currency
        }

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            result = await fetch_rate_from_api("USD", "XYZ", date(2024, 1, 15))

            assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_on_non_200_status(self):
        """Test that None is returned on non-200 status code."""
        mock_response = MagicMock()
        mock_response.status_code = 404

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            result = await fetch_rate_from_api("USD", "MXN", date(2024, 1, 15))

            assert result is None

    @pytest.mark.asyncio
    async def test_calls_correct_api_url(self):
        """Test that the correct frankfurter.app URL is called."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"rates": {"EUR": 0.85}}

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            await fetch_rate_from_api("USD", "EUR", date(2024, 1, 15))

            # Verify the correct URL and params
            call_args = mock_client.get.call_args
            assert call_args[0][0] == "https://api.frankfurter.app/2024-01-15"
            assert call_args.kwargs["params"]["from"] == "USD"
            assert call_args.kwargs["params"]["to"] == "EUR"

    @pytest.mark.asyncio
    async def test_normalizes_currency_to_uppercase(self):
        """Test that currency codes are normalized to uppercase."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"rates": {"MXN": 17.5}}

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            mock_client_class.return_value = mock_client

            result = await fetch_rate_from_api("usd", "mxn", date(2024, 1, 15))

            # Verify currencies were uppercased in the API call
            call_kwargs = mock_client.get.call_args.kwargs
            assert call_kwargs["params"]["from"] == "USD"
            assert call_kwargs["params"]["to"] == "MXN"
            # The result lookup should also work with uppercase
            assert result == 17.5


class TestFetchRate:
    """Tests for the fetch_rate orchestration function."""

    @pytest.fixture
    def mock_settings(self):
        """Mock settings with valid Supabase config."""
        with patch("app.services.exchange.get_settings") as mock:
            settings = MagicMock()
            settings.supabase_url = "https://test.supabase.co"
            settings.supabase_service_key = "test-service-key"
            mock.return_value = settings
            yield mock

    @pytest.mark.asyncio
    async def test_returns_cached_rate_when_available(self, mock_settings):
        """Test that cached rate is returned when available."""
        cached_data = {
            "rate": 17.5,
            "source": "frankfurter",
        }

        with patch("app.services.exchange.get_cached_rate", new_callable=AsyncMock) as mock_get_cache:
            mock_get_cache.return_value = cached_data

            rate, source, cached = await fetch_rate("USD", "MXN", date(2024, 1, 15))

            assert rate == 17.5
            assert source == "frankfurter"
            assert cached is True
            mock_get_cache.assert_called_once_with("USD", "MXN", date(2024, 1, 15))

    @pytest.mark.asyncio
    async def test_calls_api_on_cache_miss(self, mock_settings):
        """Test that API is called when cache misses."""
        with patch("app.services.exchange.get_cached_rate", new_callable=AsyncMock) as mock_get_cache:
            with patch("app.services.exchange.fetch_rate_from_api", new_callable=AsyncMock) as mock_api:
                with patch("app.services.exchange.save_rate", new_callable=AsyncMock) as mock_save:
                    mock_get_cache.return_value = None  # Cache miss
                    mock_api.return_value = 17.5
                    mock_save.return_value = {"id": 1}

                    rate, source, cached = await fetch_rate("USD", "MXN", date(2024, 1, 15))

                    assert rate == 17.5
                    assert source == "frankfurter"
                    assert cached is False
                    mock_api.assert_called_once_with("USD", "MXN", date(2024, 1, 15))

    @pytest.mark.asyncio
    async def test_saves_to_cache_after_api_fetch(self, mock_settings):
        """Test that rate is saved to cache after fetching from API."""
        with patch("app.services.exchange.get_cached_rate", new_callable=AsyncMock) as mock_get_cache:
            with patch("app.services.exchange.fetch_rate_from_api", new_callable=AsyncMock) as mock_api:
                with patch("app.services.exchange.save_rate", new_callable=AsyncMock) as mock_save:
                    mock_get_cache.return_value = None  # Cache miss
                    mock_api.return_value = 18.0
                    mock_save.return_value = {"id": 1}

                    await fetch_rate("USD", "MXN", date(2024, 1, 15))

                    mock_save.assert_called_once_with(
                        "USD", "MXN", 18.0, date(2024, 1, 15), "frankfurter"
                    )

    @pytest.mark.asyncio
    async def test_raises_value_error_when_both_fail(self, mock_settings):
        """Test that ValueError is raised when both cache and API fail."""
        with patch("app.services.exchange.get_cached_rate", new_callable=AsyncMock) as mock_get_cache:
            with patch("app.services.exchange.fetch_rate_from_api", new_callable=AsyncMock) as mock_api:
                mock_get_cache.return_value = None  # Cache miss
                mock_api.return_value = None  # API failure

                with pytest.raises(ValueError) as exc_info:
                    await fetch_rate("USD", "XYZ", date(2024, 1, 15))

                assert "Could not fetch exchange rate" in str(exc_info.value)
                assert "USD" in str(exc_info.value)
                assert "XYZ" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_returns_correct_source_flag(self, mock_settings):
        """Test that the correct source flag is returned for cached vs fresh data."""
        # Test cached case
        with patch("app.services.exchange.get_cached_rate", new_callable=AsyncMock) as mock_get_cache:
            mock_get_cache.return_value = {"rate": 17.5, "source": "manual"}

            rate, source, cached = await fetch_rate("USD", "MXN", date(2024, 1, 15))

            assert cached is True
            assert source == "manual"  # Preserves original source

        # Test fresh case
        with patch("app.services.exchange.get_cached_rate", new_callable=AsyncMock) as mock_get_cache:
            with patch("app.services.exchange.fetch_rate_from_api", new_callable=AsyncMock) as mock_api:
                with patch("app.services.exchange.save_rate", new_callable=AsyncMock):
                    mock_get_cache.return_value = None
                    mock_api.return_value = 17.5

                    rate, source, cached = await fetch_rate("USD", "MXN", date(2024, 1, 15))

                    assert cached is False
                    assert source == "frankfurter"

    @pytest.mark.asyncio
    async def test_does_not_call_api_when_cache_hits(self, mock_settings):
        """Test that API is not called when cache hits."""
        with patch("app.services.exchange.get_cached_rate", new_callable=AsyncMock) as mock_get_cache:
            with patch("app.services.exchange.fetch_rate_from_api", new_callable=AsyncMock) as mock_api:
                mock_get_cache.return_value = {"rate": 17.5, "source": "frankfurter"}

                await fetch_rate("USD", "MXN", date(2024, 1, 15))

                mock_api.assert_not_called()

    @pytest.mark.asyncio
    async def test_handles_save_failure_gracefully(self, mock_settings):
        """Test that fetch_rate still returns rate even if save fails."""
        with patch("app.services.exchange.get_cached_rate", new_callable=AsyncMock) as mock_get_cache:
            with patch("app.services.exchange.fetch_rate_from_api", new_callable=AsyncMock) as mock_api:
                with patch("app.services.exchange.save_rate", new_callable=AsyncMock) as mock_save:
                    mock_get_cache.return_value = None
                    mock_api.return_value = 17.5
                    mock_save.return_value = None  # Save failed

                    # Should still return the rate
                    rate, source, cached = await fetch_rate("USD", "MXN", date(2024, 1, 15))

                    assert rate == 17.5
                    assert cached is False
