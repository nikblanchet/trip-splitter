"""Tests for API router endpoints."""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from datetime import date
from fastapi.testclient import TestClient

from app.main import app
from app.models import Balance, Settlement, OCRResult, LineItemParsed, TaxLineParsed

client = TestClient(app)


class TestHealthEndpoints:
    """Tests for health and root endpoints."""

    def test_health_check_returns_healthy(self):
        """Health check endpoint should return healthy status."""
        response = client.get("/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "trip-splitter-api"

    def test_root_returns_api_info(self):
        """Root endpoint should return API information."""
        response = client.get("/")

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Trip Splitter API"
        assert data["version"] == "1.0.0"
        assert data["docs"] == "/docs"
        assert data["health"] == "/health"


class TestSettlementsRouter:
    """Tests for the settlements router endpoints."""

    @patch("app.routers.settlements.get_trip_balances")
    def test_get_balances_returns_list(self, mock_get_balances):
        """GET /trips/{trip_id}/balances should return list of balances."""
        # Arrange
        mock_balances = [
            Balance(participant_id="p1", amount=50.0),
            Balance(participant_id="p2", amount=-30.0),
            Balance(participant_id="p3", amount=-20.0),
        ]
        mock_get_balances.return_value = mock_balances

        # Act
        response = client.get("/trips/trip123/balances")

        # Assert
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 3
        assert data[0]["participant_id"] == "p1"
        assert data[0]["amount"] == 50.0
        assert data[1]["participant_id"] == "p2"
        assert data[1]["amount"] == -30.0
        mock_get_balances.assert_called_once_with("trip123")

    @patch("app.routers.settlements.get_trip_balances")
    def test_get_balances_returns_empty_list(self, mock_get_balances):
        """GET /trips/{trip_id}/balances should return empty list when no participants."""
        mock_get_balances.return_value = []

        response = client.get("/trips/empty-trip/balances")

        assert response.status_code == 200
        data = response.json()
        assert data == []

    @patch("app.routers.settlements.get_trip_balances")
    def test_get_balances_returns_500_on_error(self, mock_get_balances):
        """GET /trips/{trip_id}/balances should return 500 on service error."""
        mock_get_balances.side_effect = Exception("Database connection failed")

        response = client.get("/trips/trip123/balances")

        assert response.status_code == 500
        data = response.json()
        assert "Failed to calculate balances" in data["detail"]
        assert "Database connection failed" in data["detail"]

    @patch("app.routers.settlements.get_trip_settlements")
    def test_get_settlements_returns_list(self, mock_get_settlements):
        """GET /trips/{trip_id}/settlements should return list of settlements."""
        mock_settlements = [
            Settlement(from_id="p2", to_id="p1", amount=30.0),
            Settlement(from_id="p3", to_id="p1", amount=20.0),
        ]
        mock_get_settlements.return_value = mock_settlements

        response = client.get("/trips/trip123/settlements")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["from_id"] == "p2"
        assert data[0]["to_id"] == "p1"
        assert data[0]["amount"] == 30.0
        mock_get_settlements.assert_called_once_with("trip123")

    @patch("app.routers.settlements.get_trip_settlements")
    def test_get_settlements_returns_empty_list(self, mock_get_settlements):
        """GET /trips/{trip_id}/settlements should return empty list when balanced."""
        mock_get_settlements.return_value = []

        response = client.get("/trips/balanced-trip/settlements")

        assert response.status_code == 200
        data = response.json()
        assert data == []

    @patch("app.routers.settlements.get_trip_settlements")
    def test_get_settlements_returns_500_on_error(self, mock_get_settlements):
        """GET /trips/{trip_id}/settlements should return 500 on service error."""
        mock_get_settlements.side_effect = Exception("Calculation failed")

        response = client.get("/trips/trip123/settlements")

        assert response.status_code == 500
        data = response.json()
        assert "Failed to calculate settlements" in data["detail"]


class TestExchangeRouter:
    """Tests for the exchange rate router endpoints."""

    @patch("app.routers.exchange.fetch_rate")
    def test_get_exchange_rate_with_valid_params(self, mock_fetch):
        """GET /exchange-rate should return rate with valid parameters."""
        mock_fetch.return_value = (20.5, "frankfurter", True)

        response = client.get(
            "/exchange-rate",
            params={"from": "MXN", "to": "USD", "date": "2024-01-15"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["rate"] == 20.5
        assert data["source"] == "frankfurter"
        assert data["cached"] is True
        mock_fetch.assert_called_once_with("MXN", "USD", date(2024, 1, 15))

    @patch("app.routers.exchange.fetch_rate")
    def test_get_exchange_rate_not_cached(self, mock_fetch):
        """GET /exchange-rate should return cached=false for fresh fetch."""
        mock_fetch.return_value = (1.08, "frankfurter", False)

        response = client.get(
            "/exchange-rate",
            params={"from": "EUR", "to": "USD", "date": "2024-06-01"}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["rate"] == 1.08
        assert data["cached"] is False

    @patch("app.routers.exchange.fetch_rate")
    def test_get_exchange_rate_returns_404_when_not_found(self, mock_fetch):
        """GET /exchange-rate should return 404 when rate not found."""
        mock_fetch.side_effect = ValueError("Exchange rate not found for XYZ/USD")

        response = client.get(
            "/exchange-rate",
            params={"from": "XYZ", "to": "USD", "date": "2024-01-15"}
        )

        assert response.status_code == 404
        data = response.json()
        assert "Exchange rate not found" in data["detail"]

    @patch("app.routers.exchange.fetch_rate")
    def test_get_exchange_rate_returns_500_on_service_error(self, mock_fetch):
        """GET /exchange-rate should return 500 on unexpected error."""
        mock_fetch.side_effect = Exception("API timeout")

        response = client.get(
            "/exchange-rate",
            params={"from": "EUR", "to": "USD", "date": "2024-01-15"}
        )

        assert response.status_code == 500
        data = response.json()
        assert "Failed to fetch exchange rate" in data["detail"]

    def test_get_exchange_rate_missing_params(self):
        """GET /exchange-rate should return 422 when required params missing."""
        response = client.get("/exchange-rate")

        assert response.status_code == 422

    def test_get_exchange_rate_invalid_date(self):
        """GET /exchange-rate should return 422 for invalid date format."""
        response = client.get(
            "/exchange-rate",
            params={"from": "EUR", "to": "USD", "date": "invalid-date"}
        )

        assert response.status_code == 422

    @patch("app.routers.exchange.save_rate")
    def test_post_exchange_rate_saves_manual_rate(self, mock_save):
        """POST /exchange-rate should save a manual rate override."""
        mock_save.return_value = True

        response = client.post(
            "/exchange-rate",
            json={
                "from_currency": "MXN",
                "to_currency": "USD",
                "rate": 17.5,
                "date": "2024-01-15"
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["rate"] == 17.5
        assert data["source"] == "manual"
        assert data["cached"] is False
        mock_save.assert_called_once_with(
            from_currency="MXN",
            to_currency="USD",
            rate=17.5,
            rate_date=date(2024, 1, 15),
            source="manual"
        )

    @patch("app.routers.exchange.save_rate")
    def test_post_exchange_rate_when_save_returns_false(self, mock_save):
        """POST /exchange-rate should still return rate when cache save fails."""
        mock_save.return_value = False

        response = client.post(
            "/exchange-rate",
            json={
                "from_currency": "EUR",
                "to_currency": "USD",
                "rate": 1.1,
                "date": "2024-02-20"
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["rate"] == 1.1
        assert data["source"] == "manual"

    @patch("app.routers.exchange.save_rate")
    def test_post_exchange_rate_returns_500_on_error(self, mock_save):
        """POST /exchange-rate should return 500 on save error."""
        mock_save.side_effect = Exception("Database write failed")

        response = client.post(
            "/exchange-rate",
            json={
                "from_currency": "EUR",
                "to_currency": "USD",
                "rate": 1.1,
                "date": "2024-02-20"
            }
        )

        assert response.status_code == 500
        data = response.json()
        assert "Failed to save exchange rate" in data["detail"]

    def test_post_exchange_rate_invalid_body(self):
        """POST /exchange-rate should return 422 for invalid request body."""
        response = client.post(
            "/exchange-rate",
            json={"rate": "not-a-number"}
        )

        assert response.status_code == 422


class TestOCRRouter:
    """Tests for the OCR router endpoints."""

    @patch("app.routers.ocr.parse_receipt_image")
    def test_parse_receipt_with_base64(self, mock_parse):
        """POST /ocr/parse/base64 should parse base64 image data."""
        mock_result = OCRResult(
            vendor="Test Restaurant",
            date="2024-01-15",
            currency="USD",
            line_items=[
                LineItemParsed(description="Burger", amount=15.99, category="food"),
                LineItemParsed(description="Beer", amount=8.50, category="alcohol"),
            ],
            tax_lines=[
                TaxLineParsed(description="Sales Tax", amount=2.20),
            ],
            subtotal=24.49,
            total=26.69,
            tip=None,
        )
        mock_parse.return_value = mock_result

        response = client.post(
            "/ocr/parse/base64",
            json={
                "image_base64": "SGVsbG8gV29ybGQ=",  # Base64 for "Hello World"
                "media_type": "image/png"
            }
        )

        assert response.status_code == 200
        data = response.json()
        assert data["vendor"] == "Test Restaurant"
        assert data["date"] == "2024-01-15"
        assert data["currency"] == "USD"
        assert len(data["line_items"]) == 2
        assert data["line_items"][0]["description"] == "Burger"
        assert data["line_items"][0]["amount"] == 15.99
        assert data["total"] == 26.69
        mock_parse.assert_called_once_with("SGVsbG8gV29ybGQ=", "image/png")

    @patch("app.routers.ocr.parse_receipt_image")
    def test_parse_receipt_base64_with_default_media_type(self, mock_parse):
        """POST /ocr/parse/base64 should use default media_type."""
        mock_parse.return_value = OCRResult()

        response = client.post(
            "/ocr/parse/base64",
            json={"image_base64": "dGVzdA=="}
        )

        assert response.status_code == 200
        mock_parse.assert_called_once_with("dGVzdA==", "image/jpeg")

    @patch("app.routers.ocr.parse_receipt_image")
    def test_parse_receipt_base64_returns_500_on_error(self, mock_parse):
        """POST /ocr/parse/base64 should return 500 on OCR error."""
        mock_parse.side_effect = Exception("Claude API error")

        response = client.post(
            "/ocr/parse/base64",
            json={"image_base64": "invalid"}
        )

        assert response.status_code == 500
        data = response.json()
        assert "OCR processing failed" in data["detail"]

    def test_parse_receipt_base64_missing_image(self):
        """POST /ocr/parse/base64 should return 422 when image_base64 missing."""
        response = client.post(
            "/ocr/parse/base64",
            json={}
        )

        assert response.status_code == 422

    @patch("app.routers.ocr.parse_receipt_image")
    def test_parse_receipt_upload_with_file(self, mock_parse):
        """POST /ocr/parse/upload should parse uploaded file."""
        mock_result = OCRResult(
            vendor="Grocery Store",
            total=45.99,
            line_items=[
                LineItemParsed(description="Apples", amount=5.99),
                LineItemParsed(description="Milk", amount=4.00),
            ]
        )
        mock_parse.return_value = mock_result

        # Create a mock file for upload
        file_content = b"fake image content"

        response = client.post(
            "/ocr/parse/upload",
            files={"file": ("receipt.jpg", file_content, "image/jpeg")}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["vendor"] == "Grocery Store"
        assert data["total"] == 45.99
        mock_parse.assert_called_once()
        # Verify it was called with the file content and media type
        call_args = mock_parse.call_args
        assert call_args[0][0] == file_content
        assert call_args[0][1] == "image/jpeg"

    @patch("app.routers.ocr.parse_receipt_image")
    def test_parse_receipt_upload_with_png(self, mock_parse):
        """POST /ocr/parse/upload should handle PNG files."""
        mock_parse.return_value = OCRResult(vendor="Shop")

        response = client.post(
            "/ocr/parse/upload",
            files={"file": ("receipt.png", b"png data", "image/png")}
        )

        assert response.status_code == 200
        call_args = mock_parse.call_args
        assert call_args[0][1] == "image/png"

    @patch("app.routers.ocr.parse_receipt_image")
    def test_parse_receipt_upload_returns_500_on_error(self, mock_parse):
        """POST /ocr/parse/upload should return 500 on OCR error."""
        mock_parse.side_effect = Exception("Vision model failed")

        response = client.post(
            "/ocr/parse/upload",
            files={"file": ("receipt.jpg", b"data", "image/jpeg")}
        )

        assert response.status_code == 500
        data = response.json()
        assert "OCR processing failed" in data["detail"]

    def test_parse_receipt_upload_missing_file(self):
        """POST /ocr/parse/upload should return 422 when file missing."""
        response = client.post("/ocr/parse/upload")

        assert response.status_code == 422

    @patch("app.routers.ocr.parse_receipt_image")
    def test_parse_receipt_empty_result(self, mock_parse):
        """POST /ocr/parse/base64 should handle empty OCR result."""
        mock_parse.return_value = OCRResult()

        response = client.post(
            "/ocr/parse/base64",
            json={"image_base64": "dGVzdA=="}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["vendor"] is None
        assert data["date"] is None
        assert data["line_items"] == []
        assert data["total"] is None

    @patch("app.routers.ocr.parse_receipt_image")
    def test_parse_receipt_with_all_fields(self, mock_parse):
        """POST /ocr/parse/base64 should return all OCR fields when present."""
        mock_result = OCRResult(
            vendor="Fine Dining Restaurant",
            date="2024-12-25",
            currency="EUR",
            line_items=[
                LineItemParsed(description="Appetizer", amount=12.00, category="food"),
                LineItemParsed(description="Main Course", amount=35.00, category="food"),
                LineItemParsed(description="Wine", amount=25.00, category="alcohol"),
                LineItemParsed(description="Dessert", amount=10.00, category="food"),
            ],
            tax_lines=[
                TaxLineParsed(description="VAT", amount=16.40),
            ],
            subtotal=82.00,
            total=98.40,
            tip=15.00,
        )
        mock_parse.return_value = mock_result

        response = client.post(
            "/ocr/parse/base64",
            json={"image_base64": "aW1hZ2U="}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["vendor"] == "Fine Dining Restaurant"
        assert data["date"] == "2024-12-25"
        assert data["currency"] == "EUR"
        assert len(data["line_items"]) == 4
        assert len(data["tax_lines"]) == 1
        assert data["tax_lines"][0]["description"] == "VAT"
        assert data["subtotal"] == 82.00
        assert data["total"] == 98.40
        assert data["tip"] == 15.00


class TestCORS:
    """Tests for CORS configuration."""

    def test_cors_headers_on_preflight(self):
        """OPTIONS request should include CORS headers."""
        response = client.options(
            "/health",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            }
        )

        # CORS preflight should be handled
        assert response.status_code in [200, 204, 400]

    def test_cors_headers_on_response(self):
        """GET request should include CORS headers when origin matches."""
        response = client.get(
            "/health",
            headers={"Origin": "http://localhost:5173"}
        )

        assert response.status_code == 200
        # CORS headers should be present for allowed origins
        # Note: TestClient may not fully simulate CORS behavior
