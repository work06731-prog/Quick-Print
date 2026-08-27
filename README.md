# QuickPrint Kiosk

Mobile-first online print kiosk: upload PDF/image → configure → pay → pick up.

## Two deployment targets

### Vercel (production)

API routes are **Vercel serverless functions** (`api/`). Frontend is a single static `index.html`.

```
quickprint/
├── index.html          ← the kiosk UI (static, deployed to Vercel)
├── api/               ← Vercel serverless functions
│   ├── health.js
│   ├── public/shop/[shopId].js
│   ├── public/files/upload.js
│   ├── orders/quote.js
│   ├── orders/index.js
│   ├── orders/[code]/index.js          ← GET /api/orders/:code
│   ├── orders/[code]/public-status.js ← GET /api/orders/:code/public-status
│   ├── orders/[code]/receipt.js        ← GET /api/orders/:code/receipt
│   ├── orders/[code]/send-receipt.js   ← POST /api/orders/:code/send-receipt
│   ├── payments/create.js               ← POST /api/payments/create
│   └── webhooks/gateway.js            ← POST /webhooks/gateway
├── lib/               ← shared modules (store, pricing, pdf, printState)
├── vercel.json        ← Vercel routing config
└── package.json
```

### Local development

The `backend/` folder contains the original Express server for local development (runs on port 4173, serves `index.html` directly). Use this for testing without Vercel.

```bash
cd quickprint
npm install
node backend/server.js    # bridge on :4173, serves index.html

# Or with Vercel CLI:
vercel dev               # serves frontend + API routes on :3000
```

## API routes

| Method | Route | Notes |
|--------|-------|-------|
| GET | `/api/health` | Health check |
| GET | `/api/public/shop/:shopId` | Shop config |
| POST | `/api/files/upload` | Multipart upload, returns fileId + pageCount |
| POST | `/api/orders/quote` | Server-side price |
| POST | `/api/orders` | Create order |
| POST | `/api/payments/create` | Get gateway checkout URL |
| GET | `/api/orders/:code` | Status + advance print state |
| GET | `/api/orders/:code/public-status` | Public-safe status |
| GET | `/api/orders/:code/receipt` | PDF receipt |
| POST | `/api/orders/:code/send-receipt` | Email receipt (stubbed) |
| POST | `/webhooks/gateway` | Gateway → kiosk webhook |

## Environment variables (Vercel)

| Variable | Example | Notes |
|----------|---------|-------|
| `GATEWAY_BASE_URL` | `https://your-gateway.up.railway.app` | Your payment gateway URL |
| `GATEWAY_API_KEY` | `pg_live_...` | From gateway admin dashboard |
| `WEBHOOK_SECRET` | `whsec_...` | From gateway admin dashboard |
| `MAX_FILE_MB` | `25` | Max upload size |
| `RETURN_PATH_TEMPLATE` | `/?op={orderCode}` | Where gateway redirects after payment |

## Architecture notes

- **`lib/store.js`** — `/tmp`-based file + order storage. Files survive ~5 min (Vercel warm window). Acceptable for single-user kiosk flow.
- **`lib/printState.js`** — Stateless print state machine. Each status GET advances the state based on wall-clock elapsed time since `paidAt`.
- **`lib/pricing.js`** — Server-side pricing. Authoritative. Browser never submits a price.
- **No secrets in frontend.** All secrets in Vercel env vars.
