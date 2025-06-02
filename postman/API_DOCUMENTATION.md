# TLDRSEC AI API Documentation

This document provides comprehensive documentation for the TLDRSEC AI API endpoints, focusing on SEC filing retrieval and analysis with Claude AI integration.

## Base URL

- **Development**: `http://localhost:3000`
- **Production**: `https://your-production-domain.com` (Replace with actual production URL)

## Authentication

Currently, the API endpoints are not authenticated. Authentication will be added in future versions.

## Environment Variables

The following environment variables are required for the API to function properly:

- `SEC_USER_AGENT`: User agent string for SEC Edgar API requests (required by SEC)
- `ANTHROPIC_API_KEY`: API key for Anthropic Claude AI

## API Endpoints

### SEC Filings

#### 1. Get Tesla SEC Filings

Fetches the latest SEC filings for Tesla (TSLA) and analyzes them using Claude AI.

- **URL**: `/api/test/sec-filings`
- **Method**: `GET`
- **URL Parameters**: None
- **Response Format**: JSON

**Example Response:**
```json
{
  "success": true,
  "metadata": {
    "ticker": "TSLA",
    "cik": "0001318605",
    "company": "Tesla, Inc.",
    "requestTimestamp": "2025-05-31T08:40:37.292Z",
    "filingCount": 1,
    "processedCount": 1,
    "aiProvider": "Claude",
    "aiModel": "claude-3-opus-20240229"
  },
  "usage": {
    "totalInputTokens": 2838,
    "totalOutputTokens": 82,
    "totalCost": 0.04872
  },
  "results": [
    {
      "filingType": "SD",
      "filingDate": "2025-05-30T16:49:07-04:00",
      "title": "SD - Tesla, Inc. (0001318605) (Filer)",
      "documentUrl": "https://www.sec.gov/Archives/edgar/data/1318605/000110465925054953/0001104659-25-054953-index.htm",
      "contentLength": 7426,
      "analysis": {
        "summary": "Tesla, Inc. filed a Form SD Specialized Disclosure Report on May 30, 2025. The filing includes an Exhibit 1.01 and a graphic image.",
        "keyMetrics": [],
        "importantDisclosures": [],
        "risks": [],
        "sentiment": "neutral"
      }
    }
  ]
}
```

#### 2. Get SEC Filings by Ticker (Dynamic Route)

Fetches multiple SEC filings for a specified ticker symbol using a dynamic route. This endpoint retrieves various filing types without requiring a specific form type parameter.

- **URL**: `/api/filings/[ticker]`
- **Method**: `GET`
- **URL Parameters**:
  - `ticker` (required): Stock ticker symbol in the URL path (e.g., AAPL, TSLA)
  - `limit` (optional): Maximum number of filings to retrieve (default: 3)
- **Response Format**: JSON
- **Features**: Uses intelligent caching to reduce Claude API costs

**Example Request:**
```
GET /api/filings/AAPL?limit=2
```

#### 3. Get SEC Filings by Ticker (Summary Endpoint)

Fetches SEC filings for a specified ticker symbol and form type.

- **URL**: `/api/filings/summary`
- **Method**: `GET`
- **URL Parameters**:
  - `ticker` (required): Stock ticker symbol (e.g., TSLA, AAPL, MSFT)
  - `formType` (required): SEC form type (e.g., 10-K, 10-Q, 8-K)
  - `limit` (optional): Maximum number of filings to retrieve (default: 5)
- **Response Format**: JSON

**Example Request:**
```
GET /api/filings/summary?ticker=AAPL&formType=10-K&limit=2
```

**Example Response:**
```json
{
  "success": true,
  "metadata": {
    "ticker": "AAPL",
    "cik": "0000320193",
    "company": "Apple Inc.",
    "requestTimestamp": "2025-05-31T08:45:12.123Z",
    "filingCount": 2,
    "processedCount": 2,
    "aiProvider": "Claude",
    "aiModel": "claude-3-opus-20240229"
  },
  "usage": {
    "totalInputTokens": 5642,
    "totalOutputTokens": 164,
    "totalCost": 0.09732
  },
  "results": [
    {
      "filingType": "10-Q",
      "filingDate": "2025-04-28T16:01:23-04:00",
      "title": "10-Q - Apple Inc. (0000320193) (Filer)",
      "documentUrl": "https://www.sec.gov/Archives/edgar/data/320193/000032019325000054/0000320193-25-000054-index.htm",
      "contentLength": 15243,
      "analysis": {
        "summary": "Apple Inc. reported Q2 2025 financial results with revenue of $94.8 billion, up 5% year-over-year, and EPS of $1.56, up 8% year-over-year.",
        "keyMetrics": [
          "Revenue: $94.8 billion (5% YoY increase)",
          "EPS: $1.56 (8% YoY increase)",
          "Services revenue: $24.2 billion (17% YoY increase)"
        ],
        "importantDisclosures": [
          "Increased quarterly dividend by 5% to $0.25 per share",
          "Authorized additional $90 billion for share repurchases"
        ],
        "risks": [
          "Supply chain constraints",
          "Foreign exchange headwinds",
          "Regulatory pressures in key markets"
        ],
        "sentiment": "positive"
      }
    },
    {
      "filingType": "8-K",
      "filingDate": "2025-04-15T08:30:45-04:00",
      "title": "8-K - Apple Inc. (0000320193) (Filer)",
      "documentUrl": "https://www.sec.gov/Archives/edgar/data/320193/000032019325000042/0000320193-25-000042-index.htm",
      "contentLength": 3521,
      "analysis": {
        "summary": "Apple announced the appointment of a new Chief Financial Officer effective May 1, 2025.",
        "keyMetrics": [],
        "importantDisclosures": [
          "Appointment of Jane Doe as new CFO",
          "Previous CFO retiring after 12 years of service"
        ],
        "risks": [],
        "sentiment": "neutral"
      }
    }
  ]
}
```

## Error Handling

The API uses standard HTTP status codes to indicate the success or failure of requests:

- `200 OK`: Request successful
- `400 Bad Request`: Invalid request parameters
- `404 Not Found`: Requested resource not found
- `500 Internal Server Error`: Server-side error

Error responses include a JSON object with an `error` field containing a description of the error:

```json
{
  "success": false,
  "error": "Failed to fetch SEC filings: Invalid ticker symbol"
}
```

## Rate Limiting

To comply with SEC Edgar API fair access policies, the API implements rate limiting:

- Maximum 2 requests per second to the SEC Edgar API
- Maximum 10 requests per minute to the Claude AI API

## Testing with Postman

1. Import the Postman collection from `postman/tldrsec-api-collection.json`
2. Set up an environment with the variable `baseUrl` set to your development or production URL
3. Run the collection to test the API endpoints

## Development Notes

- The API is built with Next.js API routes
- SEC filings are fetched using the SEC Edgar API
- Filing analysis is performed using Anthropic Claude AI
- XML responses from SEC Edgar are parsed using @xmldom/xmldom and xpath
