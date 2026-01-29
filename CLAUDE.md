# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Trip Splitter is a full-stack expense-splitting app for group trips. The architecture uses a hybrid approach: Supabase handles CRUD operations directly from the frontend, while a FastAPI backend handles compute-heavy tasks (OCR receipt parsing, balance calculations, settlement optimization).

## Development Commands

### Frontend (in `/frontend`)
```bash
npm install              # Install dependencies
npm run dev              # Dev server on localhost:5173
npm run build            # Production build (tsc -b && vite build)
npm run lint             # Run ESLint
```

### Backend (in `/backend`)
```bash
pip install -r requirements.txt        # Install dependencies
uvicorn app.main:app --reload          # Dev server on localhost:8000
pytest                                 # Run all tests
pytest tests/test_settlement.py        # Run specific test file
pytest tests/test_settlement.py::test_name -v  # Run single test
```

## Architecture

```
Frontend (React/Vite)          Backend (FastAPI)           Database (Supabase)
       │                              │                          │
       ├──── CRUD operations ─────────┼──────────────────────────►
       │     (via Supabase client)    │                          │
       │                              │                          │
       └──── Compute tasks ───────────►                          │
             - OCR parsing            ├──── Fetch data ──────────►
             - Balance calculation    │     (httpx to REST API)
             - Settlement optimization│
```

**Key design principle**: Frontend talks directly to Supabase for data operations. Backend is stateless and only performs calculations.

## Key Files

- `backend/app/main.py` - FastAPI app with CORS config and 3 routers
- `backend/app/services/ocr.py` - Claude Vision API integration (uses claude-sonnet-4-20250514)
- `backend/app/services/settlement.py` - Balance and settlement calculation algorithms
- `frontend/src/lib/supabase.ts` - Supabase client initialization
- `frontend/src/lib/api.ts` - Backend API wrapper functions
- `supabase/migrations/001_initial_schema.sql` - Complete database schema
- `.planning/trip-splitter-spec.md` - Detailed spec with architecture, schema, and business logic pseudocode

## Environment Variables

**Backend `.env`:**
```
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJxxxx
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

**Frontend `.env`:**
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxx
VITE_API_URL=http://localhost:8000
```

## Database Schema

10 core tables with soft-delete support. Key tables:
- `trips` - Trip metadata with invite codes
- `participants` - Members with optional aliases for search
- `receipts` - Scanned/manual with OCR results and exchange rates
- `line_items` - Items with category (food/alcohol/other) for tax handling
- `item_assignments` - Links items to participants with share splitting
- `direct_payments` - Settlement payments between participants

Views exist for active records (filtering out soft-deleted rows).

## API Endpoints

**OCR**: `POST /ocr/parse` - Accepts file upload or base64 JSON
**Balances**: `GET /trips/{trip_id}/balances` - Current balance per participant
**Settlements**: `GET /trips/{trip_id}/settlements` - Optimized payment plan
**Exchange**: `GET /exchange-rate?from=MXN&to=USD&date=YYYY-MM-DD`

## Business Logic Notes

- Settlement algorithm uses greedy matching to minimize number of transactions
- Balance calculation handles unequal share splitting and unassigned items (split equally)
- Tax lines can apply to specific categories (e.g., alcohol tax vs food tax)
- Multi-currency support with exchange rate caching
