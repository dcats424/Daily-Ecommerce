# DailyMart — Full System Specification

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | NestJS (TypeScript), PostgreSQL, **Prisma ORM** |
| **Admin Dashboard** | React + Vite + Tailwind CSS + TanStack Query |
| **Customer App** | Flutter |
| **Auth** | **Phone OTP** (customers), **Email + Password** (staff) |
| **ERP Sync** | Microsoft Dynamics NAV 2015 via `mssql` package, 15-min polling via `@nestjs/schedule` |
| **WebSocket** | Socket.IO with Redis adapter |
| **Infra** | Docker / Docker Compose |

---

## Application Overview

**DailyMart** is a bilingual (English / Amharic) e-commerce platform for grocery delivery. The application serves two distinct user groups:

- **Customers** — Browse products, place orders, make payments, track delivery via Flutter mobile app
- **Admin Staff** — Manage orders, products, inventory, users, reports via React web dashboard

The system supports **5 payment methods**, **3-level product hierarchy (synced from NAV)**, **GPS-based delivery logistics**, **gift cards (physical & digital)**, **RBAC for staff**, and **i18n for English/Amharic**.

---

## Non-Negotiable Rules

1. **No catalog write endpoints** — products, prices, and branches are synced read-only from NAV. No create/update/delete for catalog data in any role, ever, under any circumstance.
2. **All SQL must be parameterized** via Prisma ORM. Never string-concatenate a query.
3. **Order and order-item status may only be changed by `OrderStateMachineService`**. No controller or other service sets `.status` directly.
4. **Every status change writes to an audit history table** — who changed it, from what value, to what value, when.
5. **Authentication:**
   - **Customers**: Phone-number-based OTP authentication only.
   - **Staff**: Email + password authentication only. Staff accounts are created by an admin (no self-registration).
6. **Customer accounts** are open self-registration (via phone OTP).
7. **Every state-changing endpoint** needs input validation via DTOs (`class-validator`), auth guard, and role guard where applicable. No exceptions for "internal" or "admin-only" routes.

---

## Authentication System

### Customer Auth (Phone OTP)
- **Login**: Enter phone number → receive OTP via SMS → verify OTP → JWT issued
- **Registration**: Phone number → OTP verify → collect profile info (name, email, etc.)
- **Session**: JWT access token (15 min) + refresh token (httpOnly, secure, sameSite=strict cookie)

### Staff Auth (Email + Password)
- **Login**: Email + password → validate credentials → JWT issued
- **Account creation**: Admin-created only (no self-registration). Admin sets email + initial password.
- **Password storage**: bcrypt hashed (never plaintext)
- **RBAC**: Role and permissions attached to JWT claims, checked server-side on every route

### Token Management
- Access tokens: short-lived (15 min)
- Refresh tokens: long-lived, stored as httpOnly, secure, sameSite=strict cookies — never in localStorage (XSS-readable)
- Refresh token rotation with reuse detection: if a used token is presented again, revoke the whole token family and force re-login. This is your signal a token was stolen.
- Only SHA-256 hash of refresh token stored in DB, never raw value

---

## Product Catalog (Read-Only from NAV)

The product catalog uses a **3-level hierarchy** (synced from NAV, no manual editing ever):

| Level | Table | Example |
|-------|-------|---------|
| L1 — Category | `category` | Beverages |
| L2 — Product Group | `product_group` | Soft Drinks |
| L3 — Item | `item` | Coca-Cola 330ml |

Each item has: bilingual title (EN/AM), UOM, image URL, and is linked to pricing per branch.

### Pricing
- Item prices per branch with date ranges (valid_from, valid_to)
- Discount percentages with date ranges
- All synced from NAV read-only — no manual price editing

### Search
- PostgreSQL `pg_trgm` trigram index on item titles (EN + AM)
- No full-text search — trigram handles partial matching efficiently

---

## Customer Modules (Flutter App)

### 1. Homepage
- Image sliders (promotional banners)
- Category grid
- Items with discount
- Featured / weekly specials / combo deals
- Language switcher (EN/AM)
- Cart badge (item count)

### 2. Product Browsing
- Category → Product Group → Item drill-down
- Single item detail: image, title (EN/AM), description, price, discount, add to cart

### 3. Search
- By item title (trigram-indexed)

### 4. Shopping Cart
- Add/remove/update quantities
- Prices looked up fresh at read time, never cached in cart row
- Persistent per customer (DB-backed)

### 5. Favorites / Wishlist
- Toggle on/off per item

### 6. Customer Profile
- View/edit profile info
- Change phone number (re-verify via OTP)
- Delivery address management (up to 3 saved addresses with GPS coordinates)

### 7. My Orders
- List orders with status
- Order detail view with line items, prices, totals
- **Shortage decision screen** (key feature) — when items are partially available, show available vs unavailable breakdown with both totals, let customer choose

### 8. Notifications
- List notifications
- Mark as read
- Real-time push via WebSocket

---

## Checkout & Payment Flow

### Flow Diagram
```
CART
  │
  ▼
Delivery Method — Pickup or Home Delivery
  │
  ▼
Time Slot Selection (Today / Tomorrow + time slot)
  │
  ▼
Billing Information (name, phone, TIN, delivery notes, ship-to-address)
  │
  ▼
Payment Method Selection
  │
  ├── Cash on Delivery
  ├── Bank Transfer (CBE, Abyssinia, Awash, Dashen, Zemen)
  └── Online Banking (Awash OTP, Amole Wallet OTP, Abyssinia/CyberSource)
  │
  ▼
Order Created → PENDING_REVIEW
```

### Payment Methods
1. **Cash on Delivery** — payment collected at delivery, status = unpaid until collected
2. **Bank Transfer** — customer selects bank, enters transaction ref + payer name, staff manually confirms payment
3. **Awash Bank** — OTP API flow (postBill → OTP sent → validate OTP → pay → order created)
4. **Amole Wallet** — OTP API flow (Action 09 request OTP → Action 01 confirm → pay → order created)
5. **Abyssinia/CyberSource** — HMAC SHA256-signed form → CyberSource payment page → callback → signature verification → order confirmed

### Payment Statuses
`unpaid` → `pending_confirmation` → `paid` | `failed`

---

## Order Status State Machine

### Order Item Statuses
```
PENDING_REVIEW → AVAILABLE
                → PARTIALLY_AVAILABLE
                → UNAVAILABLE → CUSTOMER_DECLINED
                              → CONFIRMED
```

### Order Statuses
```
PENDING_REVIEW → UNDER_REVIEW → AWAITING_CUSTOMER_DECISION
                                                    ↓
                              ┌─────────────────────┴─────────────────────┐
                              │                                           │
                              ▼                                           ▼
                          CONFIRMED                                   CANCELLED
                              │
                              ▼
                          PREPARING
                              │
                              ▼
                           READY
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
                 PICKED (pickup)    DELIVERED (driver)
                    │                   │
                    └─────────┬─────────┘
                              ▼
                          DELIVERED

CANCELLED / EXPIRED — terminal states (reachable from any state)
```

### The Core Feature — Shortage Decision Flow

When staff reviews an order and not all items are available:
1. Staff marks each item as AVAILABLE / PARTIALLY_AVAILABLE / UNAVAILABLE with qtyAvailable input
2. When all items reviewed, system evaluates in same transaction:
   - All available → **CONFIRMED**, notify customer "order confirmed"
   - All unavailable → **CANCELLED**, notify customer with reason
   - Mixed result → **AWAITING_CUSTOMER_DECISION**, set `decision_deadline = now + 6 hours` (configurable), notify customer with breakdown and totals for both scenarios
3. Customer decides via `POST /orders/:id/decision`:
   - **PROCEED**: unavailable/declined items → CUSTOMER_DECLINED, available items → CONFIRMED, recalculate total, order.status = CONFIRMED
   - **CANCEL**: order.status = CANCELLED
4. If deadline expires → **EXPIRED** (auto-cancelled via 5-min cron job)

---

## Admin Modules (React Dashboard)

### 1. Dashboard
- KPI cards: Total orders, new orders, pending review, delivered, customers, items
- Charts: Orders by category (donut), revenue over time
- Tables: Recent orders, top customers, top sold items

### 2. Order Management
- **Orders queue**: Live-updating via WebSocket, shows PENDING_REVIEW and UNDER_REVIEW orders oldest first
- **Order review screen**: Per item — show qty requested, NAV stock snapshot with "as of HH:MM — unverified, confirm physically" label, buttons for Available / Partial (with qty input) / Unavailable
- **Order lifecycle advancement**: PREPARING → READY → PICKED → DELIVERED via PATCH /admin/orders/:id/status, role-gated with legal transition validation
- **Cancel with reason**: Modal with reason textarea
- **Order detail**: Customer info, delivery info, payment info, line-item table, subtotal, total
- **Order audit log**: Status history with who/when/from/to
- **Order PDF generator**: Print-ready with company logo, barcodes, signature areas

### 3. Catalog (Read-Only — No Edit Buttons)
- Browse categories, product groups, items
- View pricing and stock snapshots per branch
- Every view shows `synced_at` staleness indicator
- No create/edit/delete anywhere in this UI

### 4. User Management
- **Staff accounts**: Admin-created email + password accounts, role assignment, shop assignment
- **Customer listing**: Read-only with name, phone, email, registration date, status (Verified/Unverified)
- **Roles**: Create roles via modal
- **Permissions (RBAC)**: Full CRUD for role-permission assignments (Read/Write/Admin levels)

### 5. Reports
- **Sales report**: Date range filter, shop filter, Excel export
- **Sales amount confirmation**: Additional verification report
- **Order log**: All status changes with audit trail, Excel export

### 6. Gift Cards
- **Physical cards (pCard)**: Inventory, sales, purchases, transfers, usage tracking
- **Electronic cards (eCard)**: Inventory, sales, transfers, usage tracking, batch activate
- Each card has: QR code, coupon code, PIN
- Can be used as login method (coupon + PIN or QR + PIN)

### 7. Slider Management
- Homepage promotional sliders with image upload
- Category-specific sliders

### 8. FAQ Management
- Full CRUD for FAQ entries displayed on customer-facing accordion page

### 9. Inventory Management
- Inventory accounts (username + PIN)
- Authorized device IDs (active/inactive toggle)
- Pending counts review
- Submitted counts with PDF report (item code, barcode, description, counted qty, NAV qty, difference, value)

### 10. SMS Management
- SMS status log with delivery status filter
- Resend failed SMS

### 11. Barcode Generation
- Dynamic barcode image generator (Code128, Code39, Code25)

---

## Database Schema

### Core Tables
| Table | Purpose | Source |
|-------|---------|--------|
| `customer` | Customer accounts | Self-registered via phone OTP |
| `staff` | Admin/staff accounts (email + bcrypt password) | Admin-created |
| `refresh_token` | SHA-256 hashed refresh tokens per user | System |
| `role` | Staff roles | Manual |
| `permission` | RBAC resource + action definitions | Manual |
| `staff_role` | Staff-to-role join | Manual |
| `category` | Product Level 1 — categories | NAV sync (read-only) |
| `product_group` | Product Level 2 — groups, belongs to category | NAV sync (read-only) |
| `item` | Product Level 3 — individual items with bilingual title, UOM, image | NAV sync (read-only) |
| `item_price` | Item pricing per branch with date ranges, discount_pct | NAV sync (read-only) |
| `item_stock_snapshot` | Stock hint per branch (nav_item_no, branch_id, qty, synced_at) — **HINT ONLY, never authoritative** | NAV sync (read-only) |
| `cart_item` | Shopping cart (customer_id, nav_item_no, qty, added_at) | Customer actions |
| `order` | Orders (id, order_number, customer_id, status, delivery_type, branch_id, payment_method, payment_status, subtotal, total, decision_deadline, reviewed_by) | Created from cart |
| `order_item` | Order line items (order_id, nav_item_no, item_name_snap, qty_requested, qty_available, unit_price_snap, line_status, reviewed_at) | Snapshot at order creation |
| `order_status_history` | Audit trail (order_id, order_item_id nullable, old_status, new_status, changed_by, note, created_at) | Every status change |
| `notification` | Notifications (customer_id nullable, staff_id nullable, type, title, body, data jsonb, read_at, created_at) | System events |
| `nav_sync_log` | Sync run history (started_at, finished_at, rows_synced, status, error_message) | Every NAV sync run |
| `address` | Saved delivery addresses with GPS coordinates (customer_id, lat, lng, description) | Customer |
| `shop` | Physical branch locations | NAV sync (read-only) |
| `gift_card_physical` / `pCard_*` | Physical gift card management | Admin |
| `gift_card_electronic` / `eCard_*` | Electronic gift card management | Admin |
| `slider` | Promotional banners (created_for, image, created_by) | Admin |
| `faq` | FAQ entries | Admin |
| `audit_log` | Generic audit trail | System |

### Key Indexes
- `idx_orders_status_created` ON `orders(status, created_at DESC)`
- `idx_orders_customer` ON `orders(customer_id, created_at DESC)`
- `idx_order_items_order` ON `order_items(order_id)`
- `idx_order_items_pending` ON `order_items(order_id)` WHERE `line_status = 'PENDING_REVIEW'` (partial)
- `idx_notifications_customer` ON `notifications(customer_id, read_at)`
- GIN trigram index on `item(title_en)` and `item(title_am)`
- Index every FK column appearing in WHERE or JOIN
- Unique constraint on payment webhook `(provider, transaction_id)`

---

## Build Phases

### Phase 1 — Foundation: Scaffolding, Auth, RBAC
- Scaffold NestJS + Prisma + PostgreSQL with modular folder structure
- Auth module:
  - **Customer**: Phone OTP flow (send OTP → verify OTP → JWT)
  - **Staff**: Email + password flow (login → validate bcrypt → JWT). Admin creates staff accounts.
- JWT access tokens (15 min) + rotating refresh tokens (SHA-256 in DB, reuse detection)
- RBAC module: roles, permissions, staff_role join, `@Roles()` decorator, `RolesGuard`
- Global ValidationPipe (whitelist, forbidNonWhitelisted), global exception filter, helmet, CORS
- Rate limiting on auth endpoints
- Unit tests for: refresh token rotation/reuse detection, staff auth validation, RolesGuard

### Phase 2 — NAV Sync + Read-Only Catalog
- nav-sync module: connect to SQL Server via `mssql` read-only, pull from NAV views
- Upsert into PostgreSQL catalog tables every 15 minutes via `@nestjs/schedule`
- `item_stock_snapshot` with clear "hint only" code comments
- `nav_sync_log` for run history (never wipe existing data on failure)
- Catalog endpoints (read-only): categories, product groups, items, search with pg_trgm
- Every response includes `synced_at` staleness indicator
- Redis cache on catalog reads (60-120s TTL), bust on successful sync

### Phase 3 — Cart + Order Creation
- Cart CRUD with prices looked up fresh at read time
- Order creation from cart: snapshot prices + item names, clear cart, set PENDING_REVIEW
- Order_number format: `ORD-YYYYMMDD-XXXX` (human-readable, not raw timestamp)
- `order_status_history` rows written on creation
- Proper indexes for status queries
- Idempotency-Key support on POST /orders

### Phase 4 — Order State Machine (Headline Feature)
- `OrderStateMachineService` — sole authority for status changes (rule 3)
- Staff review endpoints: mark items AVAILABLE / PARTIALLY_AVAILABLE / UNAVAILABLE
- Completion check logic (all-available → confirm, all-unavailable → cancel, mixed → customer decision)
- Customer decision endpoint: PROCEED (partial order) or CANCEL
- Expiry cron job (5-min interval, configurable deadline)
- CONFIRMED lifecycle: PREPARING → READY → PICKED → DELIVERED (with transition validation)
- SMS/push notification dispatch via outbox/queue after transaction commits
- Thorough unit tests covering all paths: all-available, all-unavailable, mixed, proceed, cancel, expiry, illegal transitions

### Phase 5 — Notifications + WebSocket
- `notifications` table as source of truth
- Two Socket.IO namespaces: `/ws/customer` (JWT in handshake, room `customer:{userId}`) and `/ws/staff` (JWT + role, room `staff:orders-queue`)
- Redis adapter from the start for horizontal scaling
- `NotificationsService.notify()` — DB write always, WebSocket push best-effort
- Events: `order.statusChanged`, `order.decisionRequired`, `order.newForReview`, `order.reviewedByOther`
- Paginated GET /notifications, PATCH /notifications/:id/read

### Phase 6 — Payments
- `PaymentProvider` interface: `initiate(order)`, `handleCallback(payload)`
- Implementations: CashProvider, BankTransferProvider, Online gateway(s) — each isolated
- Signature verification on every webhook/callback, no exceptions
- Dedupe by provider transaction ID with DB unique constraint
- Wire payment confirmation into order lifecycle appropriately

### Phase 7 — React Admin Dashboard
- Scaffold React + Vite + Tailwind + TanStack Query
- Priority screens in order:
  1. Staff login (email + password)
  2. Orders queue (live via WebSocket, PENDING_REVIEW/UNDER_REVIEW oldest first)
  3. Order review screen (per-item availability with stock snapshot hint)
  4. Order detail/lifecycle screen (advance status, cancel with reason)
  5. Read-only catalog browse
- Structure: `src/features/{auth,orders,catalog,staff}`, `src/shared/{components,hooks,lib}`
- Route-based code splitting, lazy-load heavier screens
- WebSocket connection logic in shared `useWebSocket` hook

### Phase 8 — Flutter Customer App
- Scaffold Flutter app
- Priority screens in order:
  1. Phone OTP login
  2. Catalog browse + search (paginated, cached images)
  3. Cart
  4. Order placement + order tracking (live status via WebSocket)
  5. **Shortage decision screen** — show available/unavailable items clearly separated, both totals, two buttons
  6. Notifications list
- Structure: `lib/core/{network,websocket,constants}`, `lib/features/{auth,catalog,cart,orders,notifications}`, `lib/l10n` for EN/AM
- State management: Riverpod or Bloc (pick one, consistent throughout)
- Tokens stored with `flutter_secure_storage`, certificate pinning, release builds with `--obfuscate`

---

## Security

### Auth & Sessions
- Access tokens short-lived (15 min), refresh tokens stored as httpOnly, secure, sameSite=strict cookies — never localStorage (XSS-readable)
- Refresh token rotation with reuse detection: if a used token is presented again, revoke whole token family, force re-login
- Store only SHA-256 hash of refresh token in DB, never raw value
- Staff accounts created by admin only — no self-registration
- Abuse detection (rate limit + logging) on login endpoints
- Staff passwords hashed with bcrypt, never stored in plaintext

### Authorization
- **Default-deny**: global guard on every route, `@Public()` decorator for open routes
- **IDOR prevention**: `GET /orders/:id` checks `order.customerId === currentUser.id` — same for cart, addresses, notifications. Authentication ≠ authorization.
- RBAC checked server-side on every staff route, never just hidden in frontend UI

### Input Handling
- DTO whitelist validation (`whitelist: true`, `forbidNonWhitelisted: true`) on every endpoint
- Sanitize free-text fields rendered back to staff (delivery notes, cancellation reasons) — stored XSS prevention
- Validate status-transition enums strictly at DTO level, on top of state machine's own validation (defense in depth)

### Database
- Never use `$queryRawUnsafe` with user input. If raw SQL needed, use `$queryRaw` tagged templates only
- Dedicated, network-restricted, SELECT-only SQL Server login for NAV sync worker

### Transport & Headers
- `helmet()` middleware, forced HTTPS + HSTS in production
- CORS: explicit origin allowlist (admin dashboard domain + mobile API domain), never `*`
- Content-Security-Policy header — at minimum lock down `default-src` and `script-src`

### CSRF
- CSRF protection on state-changing admin endpoints (double-submit-cookie pattern). `sameSite=strict` covers a lot but don't rely on it alone.

### Rate Limiting
- Global baseline on everything
- Tighter limits on: `/auth/*` (brute-force/abuse), `POST /orders` (order-spam), `POST /orders/:id/decision`, `GET /catalog/search` (DB hammering via scraping), payment webhook endpoints (replay abuse)
- `@nestjs/throttler` with Redis storage backend, not in-memory — in-memory limits reset per instance

### Idempotency
- `POST /orders` accepts `Idempotency-Key` header, stores against resulting order, returns same order on retry
- Payment webhook processing: dedupe by provider's transaction ID with DB unique constraint

### Payments
- Verify HMAC/webhook signatures server-side on every callback, every provider, no exceptions
- Never trust client-reported "payment succeeded" — only verified server-side callback moves `payment_status`

### Secrets & Logging
- All secrets in env vars/secret manager, never in repo
- Mask PII (phone numbers, TIN numbers) in logs — structured logging (Winston) with request IDs
- Rotate JWT signing secret and NAV read-only credential on schedule

### WebSocket
- Verify JWT on handshake, re-check role when socket joins a room
- Rate-limit socket event emission too, not just HTTP routes

### Mobile (Flutter)
- Store tokens with `flutter_secure_storage` (Keychain/Keystore-backed), never SharedPreferences in plaintext
- Certificate pinning on API connection — protects against MITM on public wifi
- Ship release builds with `--obfuscate` and `--split-debug-info`

### Dependency Hygiene
- `npm audit`/Dependabot/Snyk in CI, fail build on high-severity findings
- Commit lockfile, pin exact versions on auth-related packages (passport, jsonwebtoken, etc.)

---

## Performance

### Database
- Every FK column appearing in WHERE or JOIN needs explicit index — verify with `EXPLAIN ANALYZE`
- Specific indexes: status+created_at composite, partial indexes on PENDING_REVIEW/AWAITING_CUSTOMER_DECISION, GIN trigram on item titles
- Connection pooling: set Prisma's `connection_limit` deliberately, or use PgBouncer in front of Postgres
- Keep transactions short — don't call SMS gateway or payment API inside a DB transaction. Commit status change first, then dispatch side effects.

### Caching
- Redis cache on catalog reads (items/categories/prices) with 60–120s TTL — NAV only syncs every 15 min, no reason to hit Postgres on every page load
- Bust cache immediately after successful NAV sync run, not on a timer
- `Cache-Control`/`ETag` headers on catalog GET endpoints so client can skip round trip entirely

### Query Shape
- Use Prisma `select`/`include` deliberately — admin orders queue shouldn't pull full order-item history when it only needs current status
- Fetch orders + items in one query (`include`) for review screen, not N+1 loop

### Background Jobs
- SMS sending, push notifications, NAV sync job, receipt/PDF generation — all through queue (BullMQ + Redis), not inline in controller
- On status change, write to outbox/queue after transaction commits, let worker send — notification never fires for change that rolled back, slow SMS gateway never holds DB lock

### Pagination
- Cursor-based pagination for admin orders queue and customer order history — offset pagination (LIMIT/OFFSET) gets slow and can skip/duplicate rows as tables grow

### Frontend (React)
- Route-based code splitting, lazy-load heavier admin screens
- Lean on TanStack Query cache instead of refetching on every navigation

### Mobile (Flutter)
- Paginate all list views
- Cache images with `cached_network_image`
- WebSocket-driven lists with targeted state updates rather than full list rebuilds on every event

### Infra Readiness
- Response compression (gzip/brotli) via Nest's compression middleware
- Stateless app instances — Redis for cache + Socket.IO adapter (horizontal scaling ready)
- `/health` endpoint for load balancer / uptime monitor
- Structured logs with request IDs at minimum (OpenTelemetry if going further)

### Load Testing
- Before go-live, run k6 or autocannon against `POST /orders` and `GET /catalog/search` specifically — highest traffic, highest risk of slow queries
