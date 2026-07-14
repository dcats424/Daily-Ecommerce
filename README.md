# DailyMart — E-Commerce & Order Management System

## Application Overview

**DailyMart** is a bilingual (English / Amharic) e-commerce platform for grocery delivery, built with vanilla PHP and Microsoft SQL Server. The application serves two distinct user groups:

- **Customers** — Browse products, place orders, make payments, track delivery
- **Admin Staff** — Manage orders, products, inventory, gift cards, users, reports

The system supports **5 payment methods**, **3-level product hierarchy**, **GPS-based delivery logistics**, **gift cards (physical & digital)**, **RBAC for staff**, **PWA for mobile**, and **i18n** for English/Amharic.

---

## Table of Contents

1. [Authentication System](#1-authentication-system)
2. [Customer Modules](#2-customer-modules)
3. [Checkout & Payment Flow](#3-checkout--payment-flow)
4. [Admin Modules](#4-admin-modules)
5. [API Endpoints](#5-api-endpoints)
6. [Appendices](#6-appendices)

---

## 1. Authentication System

The app has **two separate authentication systems** — one for customers (frontend), one for admin staff (backoffice).

### 1.1 Customer Login

**File:** `login.php` (root)
**Database table:** `[dbo].[customer]`

The customer login page supports **two login methods** selected via radio buttons:

| Method | Input Fields | SQL Query |
|--------|-------------|-----------|
| **By Phone** | Country prefix dropdown + phone number + password | `SELECT * FROM [dbo].[customer] WHERE mobile_number = '{$phone}' AND password = '{$password}'` |
| **By Email** | Email + password | `SELECT * FROM [dbo].[customer] WHERE email = '{$email}' AND password = '{$password}'` |

**Password storage:** Plaintext (no hashing — passwords are compared as raw strings in SQL).

**Session variables set on success:**
- `$_SESSION["customer_id"]` — Customer's database ID
- `$_SESSION["email"]` — Customer's email
- `$_SESSION["username"]` — Customer's mobile number
- `$_SESSION["role"]` — Always `"customer"`

**On success:** Redirects to `home.php`
**On failure:** Shows error `"Username/password not found."`

**"Remember Me" feature:** Stores email/username and password in browser cookies.

**"View as Guest":** Allows browsing without logging in.

---

### 1.2 Customer Registration

**File:** `account/register.php`
**Database table:** `[dbo].[customer]`

**Form fields:** First name (EN + AM), Middle name (EN + AM), Last name (EN + AM), Phone number, Email, Gender, Language preference, Date of birth.

**Note:** This registration form has a **defect** — it calls a `create_user()` function with 11 arguments that does not match the function definition (which expects 7 arguments). The form also does **not collect a password**. Customers likely receive credentials via SMS/OTP flow elsewhere. This page may not function correctly in its current state.

---

### 1.3 Customer Logout

**File:** `all_home_items_/logout.php`

Nullifies `customer_id`, `username`, and `role` session variables, then redirects to `login.php`. Does NOT destroy the session entirely.

---

### 1.4 Customer Forgot Password

**File:** `account/forgotpw.php`

This is a **static informational page** only. It tells the user to send an SMS with the word "reset" to phone number **8495** from their registered mobile number, and a new password will be sent back via SMS. No form, no database interaction.

---

### 1.5 Admin / Staff Login

**File:** `account/login.php`
**Database table:** `[dbo].[user]`

**Form fields:** Email, Password

**SQL query:**
```sql
SELECT * FROM [dbo].[user] WHERE email = '{$email}' AND password = '{$password}'
```

**Password storage:** Plaintext (same as customer).

**Session variables set on success:**
- `$_SESSION["admin_id"]` — Admin's database ID
- `$_SESSION["username"]` — Admin's username
- `$_SESSION["role"]` — Admin's role name

**Post-login redirect (role-based):**
1. Has **Dashboard** privilege → `admin/dashboard.php`
2. Has **New Orders** privilege → `admin/newOrders.php`
3. Otherwise → `admin/index.php`

---

### 1.6 Role-Based Access Control (RBAC)

**Database tables:** `[dbo].[role]`, `[dbo].[resource]`, `[dbo].[privilege]`

| Table | Purpose |
|-------|---------|
| `role` | Defines staff roles (admin, sales, salesSupervisor, editor, user, company) |
| `resource` | Defines system resources (Dashboard, New Orders, Users, Products, etc.) |
| `privilege` | Assigns access level (1=Read, 2=Write, 3=Admin) per role per resource |

**Key function:** `check_privilege($role_id, $resource_id, $privilege_level)` — used throughout the admin panel to conditionally render menu items and action buttons.

**Role-specific session check functions:**
- `confirm_admin_logged_in()` — Requires role = admin
- `confirm_sales_supervisor_logged_in()` — Requires role = salessupervisor
- `confirm_sales_logged_in()` — Requires role = sales
- `confirm_user_logged_in()` — Requires role = user
- `confirm_company_logged_in()` — Requires role = company

---

### 1.7 Admin Logout

**File:** `admin/logout.php`

Nullifies `admin_id`, `username`, and `role` session variables, then redirects to `account/login.php`.

---

### 1.8 Guest / Coupon / QR Code Login (Alternate Customer Login)

Customers can also log in using a **gift card coupon + PIN** or **QR code + PIN**:

| Method | Table | SQL |
|--------|-------|-----|
| Coupon login | `[dbo].[pCard_Sales]` | `SELECT * FROM [dbo].[pCard_Sales] WHERE pCard_coupon = '{$coupon}' AND pCard_pin = '{$pin}'` |
| QR login (starts with "E") | `[dbo].[eCard_Transfer]` | Queries eCard_Transfer table |
| QR login (other) | `[dbo].[pCard_Sales]` | `SELECT * FROM [dbo].[pCard_Sales] WHERE pCard_qrcode = '{$qrcode}' AND pCard_pin = '{$pin}' AND status = 1` |

---

## 2. Customer Modules

### 2.1 Homepage

**File:** `home.php` (redirects to `all_home_items_/home2.php`)

**Sections displayed (top to bottom):**
1. **Image Sliders** — Promotional banners fetched from `[dbo].[slider]` where `created_for = 'Home Page'`
2. **Category Grid** — All top-level categories from `[dbo].[category]`, each with image
3. **Items with Discount** — Products that have active discounts from `[dbo].[price_discount]`
4. **Top 6 Items (Weekly Specials)** — Featured items from `[dbo].[top_item]` table
5. **Combo / Package Deals** — Active combos from `[dbo].[combo_header]`
6. **Cart Badge** — Item count in the top navigation bar
7. **Language Switcher** — Toggle between English and Amharic

**Data sources:** categories, sliders, discounts, top items, combos, cart

---

### 2.2 Product Browsing (4-Level Hierarchy)

The product catalog uses a **4-level hierarchy**:

| Level | Table | Example |
|-------|-------|---------|
| L1 — Category | `[dbo].[category]` | Beverages |
| L2 — Product Group | `[dbo].[product_group]` | Soft Drinks |
| L3 — Brand | `[dbo].[brand]` | Coca-Cola |
| L4 — Item | `[dbo].[item]` | Coke 330ml Can |

Each item has: bilingual title (EN/AM), bilingual specifications (EN/AM), image, UOM (unit of measure), and is linked to pricing and discounts.

#### Category Listing Page
**File:** `catagory.php?id=X`
- Shows all product groups within a category (L2 under L1)
- Each group shows as a card with an "Add to Cart" button
- Category-specific slider images shown as background

#### All Products Page
**File:** `allProduct.php?type=all|catagory|sub-catagory&id=X`
- `type=all` — Shows all product groups
- `type=catagory` — Filters by category (L1)
- `type=sub-catagory` — Filters by product group (L2)

#### Single Product Detail Page
**File:** `single-product.php?id=X`
- Product image, bilingual title and description
- Current price (filtered by date range from `[dbo].[price]`)
- Discount percentage (from `[dbo].[price_discount]`)
- Quantity input and "Add to Cart" button
- Full specifications in English and Amharic

**Pricing logic:** The system looks up `[dbo].[price]` where the current date falls between `start_date` and `end_date`, filtered by `customer_no LIKE 'SCO%'`. If a discount exists, the final price = price × (1 − discount_per / 100).

---

### 2.3 Product Search

**Files:** `search.php`, `searchProduct.php`

- `search.php` — Page-based search via GET parameter `?search=keyword`
- `searchProduct.php` — AJAX endpoint (POST) that returns HTML table rows of matching products

**Search SQL:**
```sql
SELECT product_id FROM [dbo].[item] WHERE title_en LIKE '%{$keyword}%' GROUP BY product_id
```
Searches item titles only (English). No full-text search. Results show product groups containing matching items, along with prices and discounts.

---

### 2.4 Featured & Discounted Products

**Files:** `allInFeatured.php`, `allInCategory.php`

These are specialized listing pages:
- `allInFeatured.php` — Shows products within a specific featured category
- `allInCategory.php` — Shows products in a category/sub-category

---

### 2.5 Shopping Cart

**Database table:** `[dbo].[cart]`
**Key columns:** id, customer_id, item, qty, total_price, date_time, package

#### Cart Pages
**Files:** `cart.php`, `cart21.php`
- Lists all cart items for the logged-in customer
- Shows item image, name, quantity, unit price, total price
- Quantity can be updated inline
- Shows delivery location selection dropdown
- "Proceed to Checkout" button

#### Add to Cart
**Files:** `addToCart.php`, `addToCartInput.php`

| File | What it does |
|------|-------------|
| `addToCart.php` | Adds combo/package items to cart via POST (`pck` = combo header number, `qty`). Sets `package = 1` in cart. |
| `addToCartInput.php` | AJAX endpoint that directly updates cart quantity via `UPDATE [dbo].[cart] SET qty = {$qty} WHERE id = {$id}` |

#### Remove from Cart
| File | Method | SQL |
|------|--------|-----|
| `deleteCart.php?id=X` | Redirect | `DELETE FROM [dbo].[cart] WHERE id = '{$id}'` |
| `deleteCartPost.php` | AJAX JSON | `DELETE FROM [dbo].[cart] WHERE item = '{$item}' AND customer_id = '{$customer}'` |
| `deleteAllCart.php` | AJAX text | `DELETE FROM [dbo].[cart] WHERE customer_id = '{$customer}'` |

**Cart badge (item count):** Retrieved via `find_total_carts_by_customer()` and displayed in the navigation header.

---

### 2.6 Favorites / Wishlist

**Database table:** `[dbo].[favorites]`
**Key columns:** id, customer_id, item_id, type, quantity

#### Pages
| File | Purpose |
|------|---------|
| `favorites.php` | View all favorite items |
| `favorites1.php` | Duplicate of favorites.php (slightly different layout) |
| `favDetail.php?id=X` | View specific favorite item detail |
| `addFavorite.php` | AJAX endpoint — toggles favorite on/off, returns JSON with status and badge count |

**Add SQL:** Inserts into `[dbo].[favorites]` only if NOT EXISTS (prevents duplicates).
**Remove SQL:** `DELETE FROM [dbo].[favorites] WHERE customer_id = '{$customer}' AND item_id = '{$item}' AND type = 'item'`

---

### 2.7 Customer Profile

| File | What it does |
|------|-------------|
| `profile.php` | Read-only display of customer info (name, phone, email, gender) |
| `edit-profile.php` | Edit first name, middle name, gender, email. **SQL:** `UPDATE [dbo].[customer] SET first_name, middle_name, gender, email WHERE id = {$id}` |
| `change-password.php` | Change password form (requires old password, new password, confirm). **SQL:** `UPDATE [dbo].[customer] SET password = '{$new}' WHERE id = {$id}` |
| `settings.php` | Navigation hub with links to edit profile, change password, language settings |
| `wallet.php` | **Empty page** — no content or functionality implemented |

---

### 2.8 My Orders (Customer)

**File:** `my-order.php`

Lists all orders for the logged-in customer, grouped by `order_id`. Each order shows:
- Order number, date, status
- Status mapping: 0=Open, 1=Delivered, 2=Assigned to shop, 3=Picked, 4=Shipped

**Data source:** `[dbo].[order]` filtered by customer, grouped by `order_id`.

---

### 2.9 Order Detail (Customer)

**Files:** `orderDetail.php`, `orderdetailedit.php`

- `orderDetail.php` — Shows all line items for a given order, with item description, UOM, quantity, unit price, and total
- `orderdetailedit.php` — Same as above but includes editable fields for modifying the order

---

### 2.10 Static Pages

| File | Content | Database? |
|------|---------|-----------|
| `about-us.php` | Static HTML about the company | No |
| `contact.php` | Contact form (posts to itself or external) | No |
| `contact_pages.php` | Contact information display | No |
| `faq.php` | FAQ accordion from `[dbo].[faq]` | Yes — `SELECT * FROM [dbo].[faq]` |
| `privacy-policy.php` | Static privacy policy text | No |
| `blog-*.php` | Blog-style pages | No |

---

### 2.11 Notifications (Customer)

**Files:** `notifications.php`, `notification-details.php`

| File | What it does |
|------|-------------|
| `notifications.php` | Lists all notifications for the customer's mobile number from `[dbo].[notification]` |
| `notification-details.php?id=X` | Shows a single notification and marks it as read (sets `status = 1`) |

**SQL (mark as read):** `UPDATE [dbo].[notification] SET status = 1 WHERE id = '{$id}'`

---

### 2.12 Language Switcher (i18n)

**File:** `language.php`

**Database:** None (uses PHP associative arrays from files)

**Files:**
- `languages/en.php` — 274 English strings
- `languages/am.php` — 267 Amharic strings

**Mechanism:** `$_SESSION['lang']` stores 'en' or 'am'. Language files are loaded in `includes/session.php`. The language can be toggled from any page via a simple form post or the dedicated language switcher page.

---

### 2.13 Delivery Address & GPS Location

**Database table:** `[dbo].[addresses]` (up to 3 saved locations per user), `[dbo].[current_location]` (pinned GPS coordinates)

**File:** `includes/location_model.php` (933 lines)

**Features:**
- Add/update current location via GPS coordinates
- Pin a delivery location on a map
- Save up to 3 delivery addresses (each with lat, lng, description)
- Delete saved locations
- Calculate distance between two points (Haversine formula)
- Find nearest shop to a given location

**Key operations (triggered by query parameters):**
| Parameter | Action |
|-----------|--------|
| `add_current_location` | Save user's current GPS position |
| `pinned_location` | Save a pinned map location |
| `save_address` | Save a delivery address |
| `load_addresses` | Retrieve saved addresses |
| `delete_location` | Remove a saved location |
| `calculate_distance` | Compute distance between two points |

---

### 2.14 PWA Features

**File:** `manifest.json`

- App name: Legacy name ("Suha") in manifest
- Start URL: `index.php`
- Orientation: Portrait-only
- Icon sizes: 72×72 to 512×512
- Mobile-first responsive design (Bootstrap + custom CSS)

---

## 3. Checkout & Payment Flow

This is the most complex part of the application. Below is the complete step-by-step flow from cart to order placement.

### 3.1 Complete Flow Diagram

```
CART
  │
  ▼
checkout.php — Choose: Pickup or Home Delivery
  │
  ▼
timeCheckout.php — Choose: Today or Tomorrow + time slot
  │
  ▼
payment-information.php — Billing info, TIN, delivery notes, ship-to-different-address
  │
  ▼
checkout-payment.php — Choose payment method
  │
  ├─────────────────────┬──────────────────────┐
  │                     │                      │
  ▼                     ▼                      ▼
checkout-          checkout-              checkout-
credit-card.php    bank_account.php       cash.php
(Online Banking)   (Bank Transfer)        (Cash on Delivery)
  │                     │                      │
  │                     ▼                      ▼
  │                 checkout-              create_order3()
  │                 bank.php               DELETE FROM cart
  │                     │                  payment-success.php
  │                     ▼
  │                 create_order3()
  │                 DELETE FROM cart
  │                 payment-success.php
  │
  ├── Amole/Awash ──┐   └── Abyssinia (CyberSource) ──┐
  │                  │                                  │
  ▼                  ▼                                  ▼
otp-confirm-    otp-confirm-                       createPendingOrder.php
bank.php        bank.php                           │
(Amole API)     (Awash API)                        │
  │                  │                             ▼
  │                  │                    INSERT INTO pending_online_order
  ▼                  ▼                    DELETE FROM cart
Amole: Action 09    Awash: postBill       redirect to:
  → OTP sent          → OTP sent           │
  → Action 01         → validateOtp       ▼
  → Pay               → Pay          confirm-payment.php
  │                  │                    (HMAC-signed form)
  ▼                  ▼                    │
create_order3()     create_order3()       ▼
DELETE FROM cart    DELETE FROM cart   CyberSource payment page
payment-success     payment-success       │
                                          ▼
                                   credit-success.php (callback)
                                          │
                                   Verify HMAC signature
                                   reason_code=100, decision=ACCEPT
                                          │
                                   create_order3() from pending
                                   DELETE pending_online_order
                                   DELETE cart
                                   payment-success.php (with SMS)
```

### 3.2 Step-by-Step Checkout Process

---

#### Step 1: Delivery Method Selection

**File:** `checkout.php`

Shows two options:

| Option | Description | Next page |
|--------|-------------|-----------|
| **Collect from Shop** (Pickup) | Customer picks up at nearest shop | `timeCheckout.php?type=Pickup` |
| **Home Delivery** (Deliver) | Delivered to customer's address | `timeCheckout.php?type=Deliver` |

Passes URL parameters: location, shop, total amount, lat/lng, street address.

**Queries:** Fetches cart items, all landmarks, nearest shop to user's pinned location, and saved GPS coordinates.

---

#### Step 2: Time Slot Selection

**Files:** `timeCheckout.php`, `timeCheckout1.php`

| Feature | Pickup | Deliver |
|---------|--------|---------|
| Time slots | Hardcoded hourly from current time to 19:00 | From `[dbo].[time_range_and_price]` per shop |
| Delivery fee | ETB 0.00 | Varies by shop; first 2 slots +50 ETB surcharge |
| Days | Today / Tomorrow tabs | Today / Tomorrow tabs |

Shows the nearest shop (for pickup) or delivery address. User selects a time slot and clicks "Book Slot".

**Button flow:** On clicking a time slot → JavaScript enables "Book Slot" button → Redirects to `payment-information.php` with all params.

---

#### Step 3: Billing Information

**Files:** `payment-information.php`, `payment-information1.php`, `payment-information2.php`

**Form fields:**
- **Bill-to name** (pre-filled from account, editable)
- **Phone number** (disabled)
- **Email** (disabled)
- **TIN Number** (optional, for tax/billing)
- **"Ship To Different Location" checkbox** — when checked, reveals:
  - First Name, Last Name, City, Email, Phone Number (for shipping)
- **Additional Delivery Notes** (textarea)

**JavaScript flow:** On clicking CONTINUE → AJAX POST to `addToCart.php` with TIN + bill-to name → on success, reads hidden HTML labels (type, date, time, location, shop, total, amount) → redirects to `checkout-payment.php`.

---

#### Step 4: Payment Method Selection

**Files:** `checkout-payment.php`, `checkout-payment1.php`

Three payment method icons:

| Method | Description | Next Page |
|--------|-------------|-----------|
| **Online Banking** | Pay via Awash, Amole, or Abyssinia (CyberSource) | `checkout-credit-card.php` |
| **Cash on Delivery** | Pay when you receive | `checkout-cash.php` |
| **Bank Transfer** | Deposit to our bank account, enter transaction ID | `checkout-bank_account.php` |

---

### 3.3 Payment Method A: Cash on Delivery

**File:** `checkout-cash.php`

**Process:**
1. Generates order ID: `unixtimestamp + customer_id` (e.g., `1689000000123`)
2. Processes combo packages first (inserts order for each combo item)
3. Processes regular cart items (inserts order for each cart item)
4. For each item, calculates discounted price if applicable
5. Calls `create_order3()` or `create_order_with_different_shipment()` to insert into `[dbo].[order]`
6. Deletes each cart item after successful order creation
7. Redirects to `payment-success.php`

**Payment details stored:** `payment_method = "Cash"`, `bank_name = ""`, `status = 0`

---

### 3.4 Payment Method B: Bank Transfer

**Step 1 — Bank Selection:** `checkout-bank_account.php`

Five Ethiopian bank options with their DailyMart account numbers:

| Bank | Account Number |
|------|---------------|
| **CBE** (Commercial Bank of Ethiopia) | 1000362268846 |
| **Abyssinia** | 46741226 |
| **Awash** | 01304830033201 |
| **Dashen** | 0142198868011 |
| **Zemen** | 1034110043823014 |

**Step 2 — Transaction Details:** `checkout-bank.php`

**Form fields:**
- **Payer Name** (required text input)
- **Transaction Number** (required text input)

**Process:** Same as cash flow, but stores `payment_method = "Bank Transfer"`, `bank_name = selected bank`, `transaction_id = user input`, `payer_name = user input`, `status = 0`.

---

### 3.5 Payment Method C: Online Banking

**Step 1 — Bank Selection:** `checkout-credit-card.php`

Three sub-options:

| Bank | Flow |
|------|------|
| **Awash Bank** | API call → OTP sent → `otp-confirm-bank.php` → validate OTP → order created |
| **Amole Wallet** | API call → OTP sent → `otp-confirm-bank.php` → validate OTP → order created |
| **Abyssinia** (Visa/CyberSource) | `createPendingOrder.php` → `confirm-payment.php` → CyberSource → `credit-success.php` callback |

**Order ID format:** `time() + rand(1000,9999) + customer_id`

#### Awash Integration
```
POST http://197.156.78.113:8080/ClientApi-1.0/esbrestapi/postBill
JSON body with debit account, credit account (DailyMart's), transaction ID, amount, timestamp
```
On success (statusCode=00): redirects to `otp-confirm-bank.php`

#### Amole Integration
```
POST https://prod.api.myamole.com:8076/amole/pay
Form data: CardNumber, PIN (empty), PaymentAction=09 (request OTP), Amount, MerchantID=DAILYMART, SourceTransID
```
On success (MSG_ErrorCode=00001): redirects to `otp-confirm-bank.php`

#### OTP Confirmation Page
**File:** `otp-confirm-bank.php`
- 4-digit OTP input with auto-advance between fields
- Phone number field (for Awash) to receive OTP
- "Verify & Proceed" button
- Resend OTP with countdown timer

**Amole OTP verify:** Action=01 (confirm with PIN code)
**Awash OTP verify:** POST to `/validateOtp` with phone + OTP

If OTP is valid: Creates order (same as cash/bank flow) and redirects to `payment-success.php`.

---

#### Abyssinia / CyberSource Flow

**Step 1:** `createPendingOrder.php`
- Deletes any existing pending orders for this customer
- Inserts each combo and cart item into `[dbo].[pending_online_order]` (NOT the real `[dbo].[order]` table)
- Payment info (method, bank) is NOT saved in pending record
- Deletes cart items
- Redirects to `confirm-payment.php` with CyberSource parameters

**Step 2:** `confirm-payment.php`
- Displays Abyssinia Bank logo + total amount
- Renders an HMAC SHA256-signed form that POSTs to `https://secureacceptance.cybersource.com/pay`
- Hidden fields: access_key, profile_id, transaction_uuid, signed fields, locale, transaction_type=sale, reference_number, currency=ETB, amount

**Step 3:** `credit-success.php` (CyberSource callback)

**Signature verification:**
```php
if ($_POST['signature'] === sign($params)) { // authentic }
```

| Decision | Action |
|----------|--------|
| **ACCEPT** (reason_code=100) | Creates real orders in `[dbo].[order]` from pending records. Payment: `method=Online Banking`, `bank=Abyssinia`. Deletes pending records. Sends SMS. Shows success page. |
| **DECLINE** | Shows error message. Order stays in `pending_online_order` (admin can release manually). |

**Success page:** Green checkmark, "Payment Successfully Done!", "We will notify you when the order is ready", "Buy Again" button.

---

### 3.6 Payment Success Page

**File:** `payment-success.php`

- Green checkmark icon + "Payment Successfully Done!" message
- "We will notify you when the order is ready"
- "Buy Again" button (initially disabled, enabled after SMS is sent)
- Sends SMS notification via AJAX POST to `sms_sender.php`
- Shows a sending animation GIF while SMS is processing

---

### 3.7 Order Status Lifecycle

Every order is created with **status = 0** (Open). The status is updated by admin only (see Admin Order Management).

| Code | Name | Description |
|------|------|-------------|
| 0 | Open | Initial state when order is placed |
| 7 | Payment Confirmed | Admin confirms payment received (for Bank Transfer & Online Banking only) |
| 3 | Preparing | Staff preparing the order |
| 4 | Ready | Ready for pickup or delivery dispatch |
| 5 | Picked | Customer collected / driver delivered |
| 1 | Delivered | Order completed successfully |
| -1 | Canceled | Order canceled by admin |

**Payment method differences:**
- **Cash on Delivery:** Skips status 7. Goes 0 → 3 → 4 → 5 → 1
- **Bank Transfer:** Requires admin to set status 7 before proceeding
- **Online Banking:** Requires admin to set status 7 before proceeding

**Note:** Inventory is **never deducted** in this system. The `check_inventory_balance()` function exists but is commented out in all order creation files:
```php
// $check = sqlsrv_num_rows(check_inventory_balance($code, $location, $qty));
$check = 1;
```

---

## 4. Admin Modules

### 4.1 Admin Dashboard

**Files:** `admin/index.php`, `admin/dashboard.php`

Two nearly identical landing pages with:

**KPI Cards (Row 1):**
| Metric | Source |
|--------|--------|
| Total Orders | `find_orders_count()` |
| New Orders | `find_new_orders_count()` |
| Delivered Orders | `find_delivered_orders_count()` |
| Short Orders | `find_short_orders_count()` |

**KPI Cards (Row 2):**
| Metric | Source |
|--------|--------|
| All Customers | `find_count_customers()` |
| Verified Customers | `find_validated_customer_count()` |
| All Items | `find_items_count()` |
| New Items | `find_latest_items_count()` |

**Tables:**
- **Recent Orders** — Last 5 orders with item image, name, ID, qty, prices, customer, status
- **Top Customers** — Customers ranked by total order count
- **Top Sold Items** — Items ranked by total quantity sold

**Chart:** C3.js donut chart — Orders by Category

---

### 4.2 Admin Layout & Navigation

**File:** `admin/header.php`

The admin panel has a fixed sidebar with menu sections. Each menu item uses `check_privilege()` to hide/show based on the user's role:

| Menu Section | Links |
|-------------|-------|
| **Dashboard** | Dashboard |
| **Inventory Count** | Accounts, Device IDs, Pending Counts, Submitted Counts |
| **Orders & Cart** | Pending Orders, New Orders, Delivered Orders, Canceled Orders, Short Orders, Cart |
| **Product** | Category 1, Category 2, Category 3, Featured Categories, Item, Price, Discount, Combos, Top Product, Land Mark Price |
| **Gift Cards** | eCards, eCard Sales, eCard Transfer, eCard Used, pCards, pCards Purchase, pCards Transfer, pCards Sales, pCards Used, pCard Transaction, Categories, Types |
| **Slider** | Sliders |
| **Users** | Customers, Users, Privileges |
| **Sales Report** | Sales |
| **Report & Others** | Order Log, SMS Status, Sales Amount Report, FAQ |
| **Logout** | Logout |

---

### 4.3 Order Management

#### Order Listings

| Page | Filter | Status |
|------|--------|--------|
| **New Orders** (`newOrders.php`) | All non-delivered, non-canceled orders | Status ≠ 1, ≠ -1 |
| **Pending Orders** (`pending_orders.php`) | Online banking payments awaiting release | Payment = Abyssinia - (Pending) |
| **Delivered Orders** (`deliveredOrders.php`) | Completed orders | Status = 1 |
| **Canceled Orders** (`canceledOrders.php`) | Canceled orders | Status = -1 |
| **Short Orders** (`shorterOrders.php`) | Partial deliveries | N/A |

Each listing is a DataTable with search, sort, Excel export, and column visibility controls.

#### Order Detail & Lifecycle

**File:** `admin/orderDetail.php` (primary), `admin/orderdetaile.php` (variant)

**Displayed data:**
- Customer info: name, phone, email
- Delivery info: date, time, location (with Google Maps link), method
- Payment info: method, bank, transaction ID, payer name
- Billing: TIN number, bill-to name, ship-to fields
- Order notes and cancellation reason
- Line-item table: item image, code, description, UOM, qty, unit price, total price, subtotal, grand total
- Print button (generates PDF via `orderPdf.php`)

**Lifecycle buttons** (dynamically shown based on current status, delivery method, and payment method):

**For Cash on Delivery:**
```
Open → Preparing → Ready → Pick (Pickup) / Arrive (Deliver) → Deliver
```

**For Bank Transfer / Online Banking:**
```
Open → Confirm Payment → Preparing → Ready → Pick/Arrive → Deliver
└─(also: Assign to Shop for Deliveries)─┘
```

**Cancel button:** Always available (for admin role). Includes a reason textarea modal.

Each button click triggers a confirmation modal, then calls `updateOrderStatus.php` or `updateOrderStatus2.php`.

#### Status Update Handlers

| File | SMS? | Purpose |
|------|------|---------|
| `updateOrderStatus.php` | Yes | Sends SMS to customer at each status change (payment confirmed, preparing, ready, delivered) |
| `updateOrderStatus2.php` | No | Same as above but without SMS |

**SMS messages sent to customer:**
- Payment confirmed: "Your secure online payment is confirmed"
- Preparing: "In-store shopper is preparing your cart"
- Ready: "Your order is ready for pickup"
- Picked/Delivered: "Your order has been picked/delivered"

#### Order PDF Generator

**File:** `orderPdf.php`
**Library:** FPDF

Generates a print-ready PDF with:
- Company logo and address
- Order info: date, number, payment method, status
- Customer info: name, phone, delivery date
- Line-item table with barcode, description, UOM, qty, prices
- Subtotal, tax, shipping, total
- Signature areas (Picked by, Checked by, Received by)

#### Order Log (Audit Trail)

**File:** `order_log.php`

Tracks every status change with:
- Log ID, Order No, New Status, Changed By (admin username), Changed At (date/time)
- Canceled status shown in red
- DataTable with Excel export

#### Order Deletion

**File:** `deleteOrder.php`

Deletes order from `[dbo].[order]` by `order_id`. Redirects back to `newOrders.php`.

#### Location Assignment

**File:** `AssignLocation.php`

Assigns an order to a specific physical shop location (called from `orderDetail.php` via AJAX). Used for the "Assign to Shop" step in the delivery lifecycle.

---

### 4.4 Product Management (CRUD)

#### Category 1 (Top-Level Categories)
**Files:** `categories.php`, `addCategory.php`, `editCategory.php`, `deleteCategory.php`

| Action | Description |
|--------|-------------|
| Create | Name in English + Amharic, image upload |
| Read | Table with image, created by, created date |
| Update | Edit name (EN/AM) and image |
| Delete | Remove category (with confirmation) |

**Database:** `[dbo].[category]`

#### Category 2 (Product Groups / Sub-Categories)
**Files:** `productGroup.php`, `addProductGroup.php`, `editProductGroup.php`, `deleteCategory2.php`

Same CRUD as Category 1, but each product group belongs to a parent category. Shows parent category title in listing.

**Database:** `[dbo].[product_group]`

#### Category 3 (Brands)
**Files:** `brand.php`, `addBrand.php`, `editBrand.php`, `deleteCategory3.php`

Same CRUD. Each brand belongs to a parent product group. Shows both Category 1 and Category 2 titles in listing.

**Database:** `[dbo].[brand]`

#### Items (Products)
**Files:** `item.php`, `addItem.php`, `editItem.php`, `deleteItem.php`

**Features:**
- Three-level cascading dropdown filters (Category → Product Group → Brand)
- Bilingual title (EN/AM) and specifications (EN/AM)
- UOM, image upload
- Product price and barcode

**Database:** `[dbo].[item]`

#### Pricing
**Files:** `price.php`

Read-only listing of item prices with effective date ranges (start_date, end_date). Each price is customer-specific (`customer_no` field).

**Database:** `[dbo].[price]`

#### Discounts
**Files:** `discount.php`

Read-only listing of discount percentages per item with date ranges.

**Database:** `[dbo].[price_discount]`

#### Combo / Package Deals
**Files:** `combos.php`, `addcombo.php`, `editCombo.php`, `deleteCombo.php`, `combo.php`

| Action | Description |
|--------|-------------|
| Create | Create combo header (description, price) + add line items (item, quantity) |
| Read | Table with item ID, description, price, active toggle |
| Update | Edit combo items and pricing |
| Delete | Remove entire combo or individual line items |

**Active toggle:** AJAX toggle to enable/disable a combo on the storefront.

**Database:** `[dbo].[combo_header]`, `[dbo].[combo_line]` (or `[dbo].[combo_detail]`)

#### Top Items (Weekly Specials / Featured Products)
**Files:** `topItem.php`, `addTopItem.php`, `deleteTop.php`

Simple list of featured items displayed on the homepage. No edit — only add and delete.

**Database:** `[dbo].[top_item]`

#### Featured Categories
**File:** `featuredCategories.php`

Manages which categories are highlighted on the homepage. Also has combo creation functionality (serves double duty).

---

### 4.5 Slider Management

**Files:** `slider.php`, `addSlider.php`, `deleteSlider.php`

Manage promotional slider images displayed on the homepage and category pages.

| Field | Description |
|-------|-------------|
| Created For | "Home Page" or specific category ID |
| Image | Upload slider image |
| Created By | Admin who created it |

**Database:** `[dbo].[slider]`

---

### 4.6 FAQ Management

**Files:** `faq.php`, `manageFaq.php`, `deleteFaq.php`

Full CRUD for FAQ entries displayed on the customer-facing FAQ accordion page.

**Database:** `[dbo].[faq]`

---

### 4.7 Gift Card Management

DailyMart supports two types of gift cards:

| Type | Table | Description |
|------|-------|-------------|
| **pCard** (Physical) | `[dbo].[pCard_Sales]`, `[dbo].[pCard_Transfer]`, etc. | Physical card with QR code + coupon code + PIN |
| **eCard** (Electronic) | `[dbo].[eCard_Sales]`, `[dbo].[eCard_Transfer]`, etc. | Digital card with QR code + coupon code + PIN |

#### Physical Cards (pCard)

| Module | Files | Description |
|--------|-------|-------------|
| pCard Inventory | `pCards.php` | List all physical cards, view details, create new |
| pCard Sales | `pCardsSales.php` | Track card sales to customers |
| pCard Purchases | `pCardsPurchase.php` | Track card purchases from suppliers |
| pCard Transfers | `pCardsTransfer.php` | Track card transfers between customers |
| pCard Usage | `pCardsUse.php` | Track card redemptions |

#### Electronic Cards (eCard)

| Module | Files | Description |
|--------|-------|-------------|
| eCard Inventory | `eCards.php` | List all e-cards, activate/deactivate, view categories & types |
| eCard Sales | `eCardSales.php` | Track e-card sales |
| eCard Transfers | `eCardTransfer.php` | Track e-card transfers |
| eCard Usage | `eCardUsed.php` | Track e-card redemptions |

**Additional:** `activateecards.php` — batch activate e-cards. `giftCategories.php` and `giftTypes.php` — manage card categories and types.

---

### 4.8 User Management

#### Staff Users
**Files:** `users.php`, `addUser.php`, `editUser.php`, `deleteUser.php`

Full CRUD for admin/staff accounts. Each user has:
- Username, Email, Password
- Role assignment (links to RBAC)
- Shop assignment

**Database:** `[dbo].[user]`

#### Customers
**File:** `customer.php`

Read-only listing of all registered customers with:
- Name (first, middle, last), Mobile, Email
- Registration date, Status (Verified/Unverified)
- Bill-to name, TIN Number, Gender, Date of Birth, Country, City
- DataTable with Excel export

**Database:** `[dbo].[customer]`

#### Roles
**File:** `role.php`

Simple role management. Create new roles via modal form. No edit or delete.

**Database:** `[dbo].[role]`

#### Privileges (RBAC)
**Files:** `privileges.php`, `addPrivilege.php`, `editPrivilege.php`, `deletePrivilege.php`

Full CRUD for role-resource privilege assignments. Each privilege has:
- Role (dropdown)
- Resource (dropdown)
- Read permission (checkbox)
- Edit permission (checkbox)
- Delete permission (checkbox)

**Database:** `[dbo].[privilege]`, `[dbo].[resource]`

---

### 4.9 Inventory Management

| Module | Files | Description |
|--------|-------|-------------|
| Inventory Accounts | `inventoryAccounts.php` | Manage user accounts for inventory counting system (username + PIN) |
| Inventory Devices | `inventory_devices.php` | Manage authorized device IDs for submitting counts (active/inactive toggle) |
| Pending Counts | `countReport.php` | List pending inventory count reports for review |
| Submitted Counts | `submittedCountReport.php` | View submitted/reviewed counts |
| Count PDF | `countPdf.php` | Generate PDF report of inventory counts with differences |

**Count PDF content:** Item code, barcode, description, counted qty, NAV qty, difference, value (difference × last direct cost).

---

### 4.10 Sales Reports

**Files:** `salesReport.php`, `sales_amount_confirm.php`, `report.php`

| Feature | Description |
|---------|-------------|
| Date range filter | Select start and end dates |
| Shop filter | Filter by location (All or specific shop) |
| Excel export | Via PhpSpreadsheet library |
| Sales amount confirmation | Additional sales verification report |

---

### 4.11 SMS Management

| Module | Files | Description |
|--------|-------|-------------|
| SMS Status | `smsStatus.php` | View all sent SMS with delivery status, filter by status and date |
| Resend SMS | `resendSms.php` | Resend failed SMS via internal API |

**Internal SMS API:** `http://172.16.32.42/sms/main/send_sms_code`

---

### 4.12 Barcode Generation

**File:** `barcode.php`

Dynamic barcode image generator. Called as `<img src="barcode.php?text=12345&codetype=code128">`.

**Supported formats:** Code128 (A/B), Code39, Code25.

---

### 4.13 Purchase & Receive Documents (pCard Operations)

| Module | Files | Description |
|--------|-------|-------------|
| Purchase Documents | `purchaseDoc.php` | View pCard purchase orders grouped by date/supplier |
| Receive Documents | `recieveDoc.php` | View incoming pCard transfers grouped for receiving confirmation |

Both have detail modals and print/PDF preparation.

---

## 5. API Endpoints

Located in `/api/`. These are REST-like endpoints (called via HTTP GET/POST, return JSON or HTML).

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `api/getUserByAccount.php` | GET/POST | Look up customer by account number |
| `api/getUserByCoupon.php` | GET/POST | Look up customer by gift card coupon |
| `api/getUserByQRCode.php` | GET/POST | Look up customer by QR code |
| `api/getUserGiftCard.php` | GET/POST | Get gift card details by customer ID |
| `api/useGiftCard.php` | GET/POST | Redeem/use a gift card |
| `api/insertCustomer.php` | POST | Register a new customer |
| `api/updatesyncsts.php` | GET/POST | Update sync status |
| `api/other/notification_by_user.php` | GET/POST | Get notifications for a user |
| `api/other/all_contact_addresses.php` | GET/POST | Get all contact addresses |

Additionally, the location system (`includes/location_model.php`) handles AJAX requests via query parameters (no dedicated API file).

---

## 6. Appendices

### 6.1 Database Schema Overview

**Database:** `DailyMart` on Microsoft SQL Server

**Core Tables:**

| Table | Purpose |
|-------|---------|
| `[dbo].[customer]` | Customer accounts |
| `[dbo].[user]` | Admin/staff accounts |
| `[dbo].[category]` | Product Level 1 (Categories) |
| `[dbo].[product_group]` | Product Level 2 (Sub-categories) |
| `[dbo].[brand]` | Product Level 3 (Brands) |
| `[dbo].[item]` | Product Level 4 (Individual items) |
| `[dbo].[price]` | Item pricing with date ranges |
| `[dbo].[price_discount]` | Discount percentages |
| `[dbo].[cart]` | Shopping cart items |
| `[dbo].[order]` | Orders (line items) |
| `[dbo].[pending_online_order]` | Pending CyberSource orders |
| `[dbo].[favorites]` | Customer wishlist |
| `[dbo].[slider]` | Homepage/category sliders |
| `[dbo].[top_item]` | Weekly specials / featured items |
| `[dbo].[combo_header]` | Combo/package deal headers |
| `[dbo].[combo_line]` (or `combo_detail`) | Combo line items |
| `[dbo].[notification]` | Push/SMS notifications |
| `[dbo].[faq]` | FAQ entries |
| `[dbo].[featured_categories]` | Featured category promotions |
| `[dbo].[shop]` | Physical shop locations |
| `[dbo].[inventory_by_location]` | Stock per shop |
| `[dbo].[inventory_count]` | Inventory count records |
| `[dbo].[addresses]` | Saved delivery addresses |
| `[dbo].[current_location]` | GPS pinned locations |
| `[dbo].[role]` | Admin roles |
| `[dbo].[resource]` | RBAC resources |
| `[dbo].[privilege]` | Role-resource permissions |
| `[dbo].[pCard_Sales]` | Physical card sales |
| `[dbo].[pCard_Transfer]` | Physical card transfers |
| `[dbo].[eCard_Sales]` | Electronic card sales |
| `[dbo].[eCard_Transfer]` | Electronic card transfers |

**ERP Integration Views (read-only from external ERP):**

| View | Source |
|------|--------|
| `[dbo].[view_item_catagory]` | Categories from ERP |
| `[dbo].[view_product_group]` | Product groups from ERP |
| `[dbo].[view_brand]` | Brands from ERP |
| `[dbo].[view_item]` | Items from ERP |
| `[dbo].[view_sales_price]` | Prices from ERP |
| `[dbo].[view_price_discount]` | Discounts from ERP |

### 6.2 Order Status State Machine

```
                    ┌──────────────────────────────────────────────┐
                    │                                              │
                    v                                              │
Open(0) ──► Payment Confirmed(7) ──► Preparing(3) ──► Ready(4) ───┘
                                               │
                                               └──► Picked(5) ──► Delivered(1)

Canceled(-1) ◄─── (from any state)
```

### 6.3 Key Architectural Notes

| Topic | Current State |
|-------|---------------|
| **Framework** | None — procedural PHP, page-based routing |
| **Database** | Microsoft SQL Server via `sqlsrv` driver |
| **Password storage** | Plaintext (no hashing) |
| **SQL injection** | Naive escaping (`str_replace("'", "''", $str)`) — no parameterized queries |
| **Inventory deduction** | NOT implemented (commented out) |
| **Code duplication** | Multiple copies of `functions.php` (7,000+ lines each) |
| **Testing** | None |
| **Composer** | Only in `admin/` for PhpSpreadsheet |
| **Payment security** | HMAC SHA256 for CyberSource; plain API calls for Awash/Amole |
| **Session** | File-based PHP sessions |
| **Carts** | Database-persisted (not session-based) |
| **PWA** | manifest.json, mobile-first responsive design |
| **i18n** | PHP arrays in language files, driven by `$_SESSION['lang']` |
| **PDF** | FPDF and TCPDF |
| **Maps** | Google Maps JavaScript API |

### 6.4 Current Known Issues

| Issue | Description |
|-------|-------------|
| Registration form broken | `register.php` calls `create_user()` with wrong number of arguments |
| Company registration broken | `registerCompany.php` calls undefined `create_company_by_user()` |
| `confirm_customer_logged_in()` bug | Checks admin session instead of customer session |
| `session.php` syntax error | `$_GET('lang')` uses parentheses instead of brackets |
| Missing function | `create_order_with_different_shipment()` is called but not defined |
| No inventory deduction | `check_inventory_balance()` is commented out everywhere |
| Combo double-processing | `checkout-cash2.php` and `checkout-bank2.php` process combos twice |
| `wallet.php` | Completely empty — no functionality implemented |
