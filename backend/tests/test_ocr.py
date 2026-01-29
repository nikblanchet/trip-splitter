"""Tests for OCR parsing logic."""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import json

from app.services.ocr import parse_receipt_image
from app.models import OCRResult, LineItemParsed, TaxLineParsed


class TestParseReceiptImage:
    """Tests for the parse_receipt_image function."""

    @pytest.fixture
    def mock_settings(self):
        """Mock settings for tests."""
        with patch("app.services.ocr.get_settings") as mock:
            settings = MagicMock()
            settings.anthropic_api_key = "test-api-key"
            mock.return_value = settings
            yield mock

    @pytest.fixture
    def sample_ocr_response(self):
        """Sample valid OCR response JSON."""
        return {
            "vendor": "Test Restaurant",
            "date": "2024-01-15",
            "currency": "USD",
            "line_items": [
                {"description": "Burger", "amount": 12.99, "category": "food"},
                {"description": "Fries", "amount": 4.99, "category": "food"},
                {"description": "Soda", "amount": 2.50, "category": "drink"},
            ],
            "tax_lines": [
                {"description": "Sales Tax", "amount": 1.64}
            ],
            "subtotal": 20.48,
            "total": 22.12,
            "tip": None,
        }

    @pytest.mark.asyncio
    async def test_parse_receipt_returns_valid_ocr_result(
        self, mock_settings, sample_ocr_response
    ):
        """Test that parse_receipt_image returns a valid OCRResult structure."""
        # Create mock response
        mock_message = MagicMock()
        mock_content = MagicMock()
        mock_content.text = json.dumps(sample_ocr_response)
        mock_message.content = [mock_content]

        with patch("app.services.ocr.AsyncAnthropic") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(return_value=mock_message)
            mock_client_class.return_value = mock_client

            result = await parse_receipt_image("base64_image_data", "image/jpeg")

            # Verify result type
            assert isinstance(result, OCRResult)

            # Verify parsed values
            assert result.vendor == "Test Restaurant"
            assert result.date == "2024-01-15"
            assert result.currency == "USD"
            assert result.subtotal == 20.48
            assert result.total == 22.12
            assert result.tip is None

            # Verify line items
            assert len(result.line_items) == 3
            assert isinstance(result.line_items[0], LineItemParsed)
            assert result.line_items[0].description == "Burger"
            assert result.line_items[0].amount == 12.99
            assert result.line_items[0].category == "food"

            # Verify tax lines
            assert len(result.tax_lines) == 1
            assert isinstance(result.tax_lines[0], TaxLineParsed)
            assert result.tax_lines[0].description == "Sales Tax"
            assert result.tax_lines[0].amount == 1.64

    @pytest.mark.asyncio
    async def test_parse_receipt_with_bytes_input(self, mock_settings, sample_ocr_response):
        """Test that parse_receipt_image handles bytes input correctly."""
        mock_message = MagicMock()
        mock_content = MagicMock()
        mock_content.text = json.dumps(sample_ocr_response)
        mock_message.content = [mock_content]

        with patch("app.services.ocr.AsyncAnthropic") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(return_value=mock_message)
            mock_client_class.return_value = mock_client

            # Pass bytes instead of string
            result = await parse_receipt_image(b"raw_image_bytes", "image/png")

            assert isinstance(result, OCRResult)
            assert result.vendor == "Test Restaurant"

    @pytest.mark.asyncio
    async def test_parse_receipt_handles_invalid_json(self, mock_settings):
        """Test handling of invalid JSON response from API."""
        mock_message = MagicMock()
        mock_content = MagicMock()
        mock_content.text = "This is not valid JSON"
        mock_message.content = [mock_content]

        with patch("app.services.ocr.AsyncAnthropic") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(return_value=mock_message)
            mock_client_class.return_value = mock_client

            result = await parse_receipt_image("base64_image_data", "image/jpeg")

            # Should return empty OCRResult on parse failure
            assert isinstance(result, OCRResult)
            assert result.vendor is None
            assert result.line_items == []
            assert result.total is None

    @pytest.mark.asyncio
    async def test_parse_receipt_extracts_json_from_text(self, mock_settings):
        """Test that JSON can be extracted even with surrounding text."""
        mock_message = MagicMock()
        mock_content = MagicMock()
        # API sometimes wraps JSON in text
        mock_content.text = 'Here is the extracted data: {"vendor": "Coffee Shop", "date": null, "currency": "USD", "line_items": [], "tax_lines": [], "subtotal": null, "total": 5.50, "tip": null} Hope this helps!'
        mock_message.content = [mock_content]

        with patch("app.services.ocr.AsyncAnthropic") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(return_value=mock_message)
            mock_client_class.return_value = mock_client

            result = await parse_receipt_image("base64_image_data", "image/jpeg")

            assert result.vendor == "Coffee Shop"
            assert result.total == 5.50

    @pytest.mark.asyncio
    async def test_parse_receipt_handles_api_error(self, mock_settings):
        """Test handling of API errors."""
        with patch("app.services.ocr.AsyncAnthropic") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(
                side_effect=Exception("API Error: Rate limit exceeded")
            )
            mock_client_class.return_value = mock_client

            # Should raise the exception
            with pytest.raises(Exception) as exc_info:
                await parse_receipt_image("base64_image_data", "image/jpeg")

            assert "API Error" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_parse_receipt_handles_partial_data(self, mock_settings):
        """Test handling of incomplete/partial response data."""
        mock_message = MagicMock()
        mock_content = MagicMock()
        # Only some fields present
        mock_content.text = json.dumps({
            "vendor": "Mystery Store",
            "line_items": [{"description": "Item", "amount": 10.00}],
            # Missing: date, currency, tax_lines, subtotal, total, tip
        })
        mock_message.content = [mock_content]

        with patch("app.services.ocr.AsyncAnthropic") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(return_value=mock_message)
            mock_client_class.return_value = mock_client

            result = await parse_receipt_image("base64_image_data", "image/jpeg")

            assert result.vendor == "Mystery Store"
            assert len(result.line_items) == 1
            assert result.date is None
            assert result.currency is None
            assert result.total is None
            assert result.tax_lines == []

    @pytest.mark.asyncio
    async def test_parse_receipt_handles_null_values(self, mock_settings):
        """Test handling of null values in response."""
        mock_message = MagicMock()
        mock_content = MagicMock()
        mock_content.text = json.dumps({
            "vendor": None,
            "date": None,
            "currency": None,
            "line_items": [],
            "tax_lines": [],
            "subtotal": None,
            "total": None,
            "tip": None,
        })
        mock_message.content = [mock_content]

        with patch("app.services.ocr.AsyncAnthropic") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(return_value=mock_message)
            mock_client_class.return_value = mock_client

            result = await parse_receipt_image("base64_image_data", "image/jpeg")

            assert result.vendor is None
            assert result.date is None
            assert result.total is None
            assert result.line_items == []

    @pytest.mark.asyncio
    async def test_parse_receipt_with_tip(self, mock_settings):
        """Test parsing receipt with tip included."""
        mock_message = MagicMock()
        mock_content = MagicMock()
        mock_content.text = json.dumps({
            "vendor": "Restaurant",
            "date": "2024-01-20",
            "currency": "USD",
            "line_items": [{"description": "Dinner", "amount": 50.00, "category": "food"}],
            "tax_lines": [{"description": "Tax", "amount": 4.00}],
            "subtotal": 50.00,
            "total": 64.00,
            "tip": 10.00,
        })
        mock_message.content = [mock_content]

        with patch("app.services.ocr.AsyncAnthropic") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(return_value=mock_message)
            mock_client_class.return_value = mock_client

            result = await parse_receipt_image("base64_image_data", "image/jpeg")

            assert result.tip == 10.00
            assert result.total == 64.00

    @pytest.mark.asyncio
    async def test_parse_receipt_different_currencies(self, mock_settings):
        """Test parsing receipts with different currencies."""
        mock_message = MagicMock()
        mock_content = MagicMock()
        mock_content.text = json.dumps({
            "vendor": "Tienda Mexico",
            "date": "2024-01-20",
            "currency": "MXN",
            "line_items": [{"description": "Tacos", "amount": 150.00, "category": "food"}],
            "tax_lines": [{"description": "IVA", "amount": 24.00}],
            "subtotal": 150.00,
            "total": 174.00,
            "tip": None,
        })
        mock_message.content = [mock_content]

        with patch("app.services.ocr.AsyncAnthropic") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(return_value=mock_message)
            mock_client_class.return_value = mock_client

            result = await parse_receipt_image("base64_image_data", "image/jpeg")

            assert result.currency == "MXN"
            assert result.total == 174.00

    @pytest.mark.asyncio
    async def test_parse_receipt_api_called_with_correct_params(self, mock_settings):
        """Test that the API is called with correct parameters."""
        mock_message = MagicMock()
        mock_content = MagicMock()
        mock_content.text = json.dumps({"vendor": "Test", "line_items": [], "tax_lines": []})
        mock_message.content = [mock_content]

        with patch("app.services.ocr.AsyncAnthropic") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(return_value=mock_message)
            mock_client_class.return_value = mock_client

            await parse_receipt_image("test_base64_data", "image/png")

            # Verify API was called
            mock_client.messages.create.assert_called_once()
            call_kwargs = mock_client.messages.create.call_args.kwargs

            # Check model
            assert call_kwargs["model"] == "claude-sonnet-4-20250514"

            # Check message structure
            messages = call_kwargs["messages"]
            assert len(messages) == 1
            assert messages[0]["role"] == "user"

            # Check content includes image
            content = messages[0]["content"]
            assert len(content) == 2  # image + text
            assert content[0]["type"] == "image"
            assert content[0]["source"]["type"] == "base64"
            assert content[0]["source"]["media_type"] == "image/png"
            assert content[0]["source"]["data"] == "test_base64_data"

    @pytest.mark.asyncio
    async def test_parse_receipt_multiple_line_items_categories(self, mock_settings):
        """Test parsing receipt with multiple line items in different categories."""
        mock_message = MagicMock()
        mock_content = MagicMock()
        mock_content.text = json.dumps({
            "vendor": "Mixed Store",
            "date": "2024-01-20",
            "currency": "USD",
            "line_items": [
                {"description": "Beer 6-pack", "amount": 12.99, "category": "alcohol"},
                {"description": "Chips", "amount": 4.99, "category": "food"},
                {"description": "Water", "amount": 1.99, "category": "drink"},
                {"description": "T-shirt", "amount": 19.99, "category": "shopping"},
            ],
            "tax_lines": [{"description": "Tax", "amount": 3.20}],
            "subtotal": 39.96,
            "total": 43.16,
            "tip": None,
        })
        mock_message.content = [mock_content]

        with patch("app.services.ocr.AsyncAnthropic") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.messages.create = AsyncMock(return_value=mock_message)
            mock_client_class.return_value = mock_client

            result = await parse_receipt_image("base64_image_data", "image/jpeg")

            assert len(result.line_items) == 4
            categories = [item.category for item in result.line_items]
            assert "alcohol" in categories
            assert "food" in categories
            assert "drink" in categories
            assert "shopping" in categories
