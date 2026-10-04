# TicketHub Design Document

TicketHub is a website that sells tickets for concerts and events. This document follows the six-part design framework: requirements, estimates, API, data model, architecture and trade-offs.

## 1. Requirements

### Functional requirements
- Users can register, log in and log out.
- Users can browse and search upcoming events.
- Users can view an event's details and its seat map with live availability.
- Users can select seats and have them held for 10 minutes while they pay.
- Users can pay for held seats and receive their tickets (by email and in the app).
- Users can view their own tickets.
- No seat can ever be sold to two people.

### Non-functional requirements
- **Correctness:** a seat is never sold twice, and a customer is never charged for a seat they do not receive. This matters more than anything else.
- **Fairness:** during a big sale, people are served roughly first come, first served, and bots cannot jump the line.
- **Speed:** event pages and seat maps load in under 1 second, even during a big sale.
- **Scalability:** the system handles normal days and the traffic spike of a popular sale (over 1,000 times normal).
- **Availability:** the site stays up during a sale, and a failure in one part must not take the whole system down.
- **Durability:** a paid order is never lost.
- **Security:** HTTPS everywhere, passwords stored as hashes, and card details handled only by the payment provider.

## 2. Estimates

### Assumptions
- 2 million registered users.
- Normal day: 50,000 visitors, each viewing 10 pages, and 5,000 tickets sold.
- Big sale: 200,000 people try to buy 20,000 seats in the first 10 minutes (600 seconds).
- During a big sale, each person makes about 20 requests in 10 minutes (one every 30 seconds): page load, seat-map refreshes, a hold and a payment.
- One day has 86,400 seconds, and normal peak traffic is 5 times the average.
- One order or ticket takes about 1 KB of storage.

### Normal traffic
- Page views: 50,000 x 10 = 500,000 per day, divided by 86,400 is **about 6 per second on average and about 29 at peak**.
- Purchases: 5,000 per day divided by 86,400 is **about 0.06 per second (one every 17 seconds), and about 0.3 at peak**.
- Storage: 5,000 tickets per day x 365 = about 1.8 million tickets per year, times 1 KB is **about 1.8 GB per year**, which is small.
- Reads to writes: 500,000 views to 5,000 purchases is **100 to 1, so the system is read-heavy**.

### Big sale peak
- All requests: 200,000 x 20 = 4,000,000 in 600 seconds is **about 6,700 per second on average, and roughly twice that (about 13,000) in the first minute**.
- Seat hold attempts: 200,000 in 600 seconds is **about 330 per second, and perhaps 1,000 per second at the very start**.
- Purchases: at most 20,000 in 600 seconds is **at most about 33 per second**.
- People who will not get a ticket: at least 180,000, which is **90% of the people trying**.

### Comparison

| Measure | Normal day (average) | Big sale |
|---|---|---|
| Requests per second | 6 | about 6,700 (about 13,000 in the first minute) |
| Purchases per second | 0.06 | up to 33 |
| Pressure on one seat | almost none | hundreds of people clicking the same good seats at the same moment |

A big sale is **over 1,000 times the normal request rate and about 500 times the normal purchase rate**, and it lasts only minutes. We cannot size the system for the average day and hope. The design must absorb a short, extreme spike. The hardest part is not the total volume but many people competing for the same seats at the same moment.

## 3. API

All endpoints except login need the header `Authorization: Bearer <token>`. The base URL is `https://api.tickethub.example/v1`.

| Method | Path | Description | Success status |
|---|---|---|---|
| POST | `/auth/login` | Log in and receive a token | 200 OK |
| GET | `/events` | Browse and search upcoming events (`q`, `date`, `page`) | 200 OK |
| GET | `/events/{id}` | Get the details of one event | 200 OK |
| GET | `/events/{id}/seats` | Get the seat map with availability (cached for a few seconds) | 200 OK |
| POST | `/events/{id}/queue` | Join the waiting room for a popular sale | 202 Accepted |
| POST | `/events/{id}/holds` | Hold chosen seats for 10 minutes | 201 Created |
| DELETE | `/holds/{id}` | Release held seats early | 204 No Content |
| POST | `/orders` | Pay for a hold and receive the tickets | 201 Created |
| GET | `/me/tickets` | List the logged-in user's tickets | 200 OK |

### Example: hold seats, `POST /events/12/holds`

Request:

```json
{
  "seat_ids": [4501, 4502]
}
```

Response (`201 Created`):

```json
{
  "hold_id": "h_83921",
  "event_id": 12,
  "seat_ids": [4501, 4502],
  "total_cents": 240000,
  "expires_at": "2026-11-20T18:10:00Z"
}
```

### Example: pay, `POST /orders`

Request:

```json
{
  "hold_id": "h_83921",
  "payment_token": "tok_abc123",
  "idempotency_key": "9f2c1a7e-5d1b-4e0b-9d34-1f7a1c2e8b11"
}
```

Response (`201 Created`):

```json
{
  "order_id": 7781,
  "status": "paid",
  "tickets": [
    { "ticket_id": 90211, "seat_id": 4501, "section": "A", "row": "C", "seat_number": 12 },
    { "ticket_id": 90212, "seat_id": 4502, "section": "A", "row": "C", "seat_number": 13 }
  ]
}
```

### Error codes

| Status | When it happens | Example |
|---|---|---|
| 400 Bad Request | The request is invalid | `seat_ids` is empty, or more than 6 seats are requested |
| 401 Unauthorized | Not logged in | A hold request with no token |
| 402 Payment Required | The payment was declined | The card has insufficient funds |
| 404 Not Found | The event, seat or hold does not exist | `GET /events/9999` |
| 409 Conflict | The seat is already taken | Someone else held seat 4501 a moment earlier |
| 410 Gone | The hold has expired | The user pays after the 10 minutes are over |
| 429 Too Many Requests | The user is sending too many requests | A bot refreshing the seat map hundreds of times a second |
| 500 Internal Server Error | An unexpected server failure | The database is unreachable |

Example error body:

```json
{
  "error": {
    "code": "SEAT_UNAVAILABLE",
    "message": "Seat A-C-12 has just been taken. Please choose another seat."
  }
}
```

## 4. Data model

### Tables

- **users:** `id` (primary key), `name`, `email` (unique), `password_hash`, `created_at`.
- **events:** `id` (primary key), `title`, `venue`, `starts_at`, `on_sale_at`.
- **seats:** `id` (primary key), `event_id` (foreign key to events), `section`, `row_label`, `seat_number`, `price_cents`, `status` (available, held or sold), `held_by_user_id` (foreign key to users, empty unless held), `hold_expires_at`. The combination of event, section, row and seat number is unique.
- **orders:** `id` (primary key), `user_id` (foreign key to users), `total_cents`, `status`, `payment_reference` (unique), `created_at`.
- **tickets:** `id` (primary key), `order_id` (foreign key to orders), `seat_id` (foreign key to seats, **unique**), `issued_at`.

### Relationships

- **One-to-many:** one event has many seats; one user has many orders; one order has many tickets.
- **One-to-one (enforced):** each seat can appear in at most one ticket. This is guaranteed by a `UNIQUE` constraint on `tickets.seat_id`.
- **Many-to-many:** users and seats are connected through orders and tickets, because a user can buy many seats and each seat can only belong to one order.

### CREATE TABLE statements

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE events (
  id          INTEGER PRIMARY KEY,
  title       TEXT NOT NULL,
  venue       TEXT NOT NULL,
  starts_at   TEXT NOT NULL,
  on_sale_at  TEXT NOT NULL
);

CREATE TABLE seats (
  id               INTEGER PRIMARY KEY,
  event_id         INTEGER NOT NULL,
  section          TEXT NOT NULL,
  row_label        TEXT NOT NULL,
  seat_number      INTEGER NOT NULL,
  price_cents      INTEGER NOT NULL CHECK (price_cents >= 0),
  status           TEXT NOT NULL DEFAULT 'available'
                   CHECK (status IN ('available', 'held', 'sold')),
  held_by_user_id  INTEGER,
  hold_expires_at  TEXT,
  UNIQUE (event_id, section, row_label, seat_number),
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  FOREIGN KEY (held_by_user_id) REFERENCES users(id)
);

CREATE TABLE orders (
  id                 INTEGER PRIMARY KEY,
  user_id            INTEGER NOT NULL,
  total_cents        INTEGER NOT NULL CHECK (total_cents >= 0),
  status             TEXT NOT NULL CHECK (status IN ('paid', 'failed', 'refunded')),
  payment_reference  TEXT NOT NULL UNIQUE,
  created_at         TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE tickets (
  id         INTEGER PRIMARY KEY,
  order_id   INTEGER NOT NULL,
  seat_id    INTEGER NOT NULL UNIQUE,  -- a seat can only ever be sold once
  issued_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (seat_id)  REFERENCES seats(id)
);

CREATE INDEX idx_seats_event_status ON seats (event_id, status);
CREATE INDEX idx_orders_user ON orders (user_id);
```

The index on `seats (event_id, status)` makes "show the available seats for this event" fast. The index on `orders (user_id)` makes "show my tickets" fast.

### 4.2 How the design prevents two people buying the same seat

Double-booking is prevented by three layers, and the database, not the application code or the cache, is the final judge.

**Layer 1: an atomic, conditional hold.** When a user selects seats, the app runs one UPDATE per seat inside a transaction. The seat is only taken if it is still free (or its old hold has expired):

```sql
BEGIN;

UPDATE seats
SET status = 'held',
    held_by_user_id = :user_id,
    hold_expires_at = datetime('now', '+10 minutes')
WHERE id = :seat_id
  AND event_id = :event_id
  AND (status = 'available'
       OR (status = 'held' AND hold_expires_at < datetime('now')));

-- If the number of rows changed is 1, the seat is now ours.
-- If it is 0, someone else got there first: respond 409 Conflict.
-- If any seat in the request fails, ROLLBACK so the user gets all seats or none.

COMMIT;
```

Suppose Amina and Ben both click seat 4501 at the same instant. The database processes updates to the same row one after the other, never at the same time. Amina's update runs first and changes the status to `held`. When Ben's update runs, the `WHERE` condition no longer matches, so it changes 0 rows and Ben receives `409 Conflict`. There is no moment when both can succeed, because the check and the change are one single step.

**Layer 2: an atomic purchase.** When the user pays, a second transaction creates the order, inserts the tickets and marks the seats as sold. It only works if the seat is still held by this user and the hold has not expired:

```sql
BEGIN;

INSERT INTO orders (user_id, total_cents, status, payment_reference)
VALUES (:user_id, :total, 'paid', :idempotency_key);

INSERT INTO tickets (order_id, seat_id) VALUES (:order_id, :seat_id);

UPDATE seats
SET status = 'sold', held_by_user_id = NULL, hold_expires_at = NULL
WHERE id = :seat_id
  AND status = 'held'
  AND held_by_user_id = :user_id
  AND hold_expires_at >= datetime('now');

-- The UPDATE must change exactly 1 row per seat, otherwise ROLLBACK.

COMMIT;
```

All three statements succeed together or none of them does (a transaction), so a seat can never be half-sold.

**Layer 3: a constraint as the last line of defence.** Even if there were a bug in the application code, `UNIQUE (seat_id)` on `tickets` means the database refuses to create a second ticket for the same seat, and the whole transaction fails.

**Extra protections:**
- **Holds expire by time, not by a background job.** The check `hold_expires_at < now` is part of the query, so an abandoned hold frees the seat even if the cleanup worker is late. A worker still tidies up expired holds so the seat map stays accurate.
- **The cache is never the judge.** The seat map shown to users may be a few seconds old, so a user may click a seat that was just taken. That only costs them a friendly `409` message. The real decision always happens in the primary database.
- **Idempotency key.** If a user clicks Pay twice, or the network retries, the unique `payment_reference` stops a second order from being created and the user from being charged twice.
- **Payment safety.** The app confirms the hold is valid, then charges the card through the payment provider, then runs the purchase transaction. If the transaction fails after the card was charged, the system automatically refunds the payment.

## 5. Architecture

### Diagram

```text
                       +-----------+
                       |   Users   |
                       +-----+-----+
                             |
                             v
                       +-----------+
                       |    DNS    |
                       +-----+-----+
                             |
                             v
                +--------------------------+
                |   CDN + rate limiting    |  <-- caches event pages, images,
                |   (bot protection)       |      and the seat map for ~2 seconds
                +------------+-------------+
                             |
                             v
                    +-----------------+
                    |  Load balancer  |
                    +--------+--------+
                             |
                             v
                +--------------------------+
                |  Waiting room (queue)    |  <-- lets in only a few thousand
                |  admits users in order   |      people at a time during a sale
                +------------+-------------+
                             |
          +------------------+------------------+
          |                  |                  |
          v                  v                  v
    +------------+     +------------+     +------------+
    | App server |     | App server |     | App server |   (auto-scaled,
    +-----+------+     +-----+------+     +-----+------+    pre-scaled before
          |                  |                  |           a big sale)
          +--------+---------+---------+--------+
                   |                   |
        reads      |                   |   writes (holds, orders)
     +-------------+                   +------------------+
     |                                                    |
     v                                                    v
+----------+                                   +--------------------+
|  Cache   |  event pages,                     |  Primary database  |
| (Redis)  |  seat map snapshot                |  (all seat holds   |
+----------+                                   |   and purchases)   |
                                               +---------+----------+
                                                         |
                                                         v
                                               +--------------------+
                                               |   Read replica     |
                                               | (browse, my tickets|
                                               |  and reports)      |
                                               +--------------------+

          App server --(card token)--> +--------------------+
                                       |  Payment provider  |
                                       |  (external)        |
                                       +--------------------+

          App server --(jobs)--> +-------+     +--------------------------+
                                 | Queue | --> | Workers: send tickets by |
                                 +-------+     | email, release expired   |
                                               | holds, refund failures   |
                                               +--------------------------+
```

### What each component does

- **DNS:** it translates `tickethub.example` into the address of our front door, and it can point users to a healthy location if one fails.
- **CDN and rate limiting:** it serves event pages, images and the short-lived seat-map snapshot from servers near the user, and it blocks bots that send hundreds of requests a second, so most of the sale's traffic never reaches our servers.
- **Load balancer:** it spreads requests across the app servers and stops sending traffic to any server that has failed.
- **Waiting room:** during a big sale it admits only a controlled number of people (for example 2,000 at a time) in the order they arrived, so the database sees steady traffic instead of 200,000 people at once, and the sale is fair.
- **App servers:** they run the API logic (browsing, holds, orders), and because they keep no user data themselves we can add many more before a sale.
- **Cache:** it keeps event details and a seat-availability snapshot in memory, so the thousands of "refresh the seat map" requests per second do not hit the database.
- **Primary database:** it is the single source of truth for seats and orders, and its transactions and constraints are what make double-booking impossible.
- **Read replica:** it answers browsing, "my tickets" and reporting queries so that those reads do not slow down the seat holds and purchases on the primary.
- **Payment provider:** an external service handles card details and charges, so we never store card numbers and do not have to build secure payments ourselves.
- **Queue:** it holds background jobs such as "email these tickets" so a purchase can finish immediately instead of waiting for slow work.
- **Workers:** they take jobs from the queue to send ticket emails, free expired holds and refund failed purchases, and they can be scaled separately from the app servers.

### How the design survives the big sale

1. **Before the sale:** event pages and images are already cached in the CDN, and extra app servers are started in advance, because a spike of this size is too sudden for auto-scaling to react in time.
2. **At the start:** 200,000 people arrive. The CDN and rate limiter absorb most of the page traffic and block bots.
3. **Waiting room:** it lets in a few thousand people at a time, in order, so the app servers and the database see a steady flow.
4. **Seat map:** the many refreshes are answered from the cache (a snapshot a couple of seconds old), not from the database.
5. **Holds:** each hold is one small, fast transaction on the primary database. At most about 1,000 per second at the start is well within what one primary can handle, and the conditional update guarantees there is only one winner per seat.
6. **After a hold:** the user has 10 minutes to pay. Abandoned holds free their seats automatically, so seats return to the pool.
7. **Purchase:** the order transaction runs on the primary (up to about 33 per second), and the ticket email is handed to the queue.
8. **Sold out:** once all 20,000 seats are sold, the system answers "sold out" quickly from the cache, which stops thousands of pointless requests reaching the database.

## 6. Trade-offs

- **Waiting room: fairness and stability vs user experience.** The waiting room protects the database and gives everyone a fair place in line, but users have to wait and it adds more parts to build and run. Without it, the servers could crash and the fastest bots would win.
- **Cached seat map: speed vs accuracy.** A snapshot that is a couple of seconds old keeps the database safe, but a user may click a seat that has just been taken and get a `409` message. We accept this because the database makes the final decision, so a stale map can annoy a user but can never cause a double sale.
- **Hold length: more purchases vs locked seats.** A short hold (for example 5 minutes) frees seats quickly but pressures slow payers. A long hold lets people pay calmly but lets people who never buy block seats from others. Ten minutes is a compromise.
- **One primary database: correctness vs scale.** Sending all seat writes to a single primary keeps the data consistent and simple, but it is one place that can become a bottleneck or fail. The waiting room limits the load on it, and a replica that can be promoted protects against failure. Splitting events across several databases would scale further but is much more complex.
- **Over-provisioning: cost vs risk.** Starting extra servers before a sale costs money, but running out of capacity during a sale would cost far more in lost sales and trust.

## Addendum: seats and holds schema with concurrency control

This section refines the data model so that holds are their own table and seat reservations are protected by explicit concurrency control. The SQL is written for PostgreSQL, which supports row locks (`SELECT ... FOR UPDATE`).

### Tables

```sql
CREATE TABLE holds (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id),
  event_id    BIGINT NOT NULL REFERENCES events(id),
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'converted', 'released', 'expired')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE seats (
  id           BIGSERIAL PRIMARY KEY,
  event_id     BIGINT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  section      TEXT NOT NULL,
  row_label    TEXT NOT NULL,
  seat_number  INTEGER NOT NULL,
  price_cents  INTEGER NOT NULL CHECK (price_cents >= 0),
  status       TEXT NOT NULL DEFAULT 'available'
               CHECK (status IN ('available', 'held', 'sold')),
  hold_id      BIGINT REFERENCES holds(id),
  version      INTEGER NOT NULL DEFAULT 0,   -- increases on every change
  UNIQUE (event_id, section, row_label, seat_number)
);

CREATE INDEX idx_seats_event_status ON seats (event_id, status);
CREATE INDEX idx_holds_expiry ON holds (expires_at) WHERE status = 'active';
```

Each seat points to at most one hold through `seats.hold_id`, so a seat can never belong to two holds at once. The `version` column counts how many times a seat has changed, and it is used for optimistic locking.

### Option A: pessimistic locking with SELECT FOR UPDATE

The transaction locks the seat rows it wants. Anyone else asking for the same rows waits, and then sees their new state.

```sql
BEGIN;

-- 1. Lock the requested seats. SKIP LOCKED makes other buyers skip seats
--    that are being claimed right now instead of waiting in a queue.
SELECT id, status, hold_id
FROM seats
WHERE id = ANY(:seat_ids) AND event_id = :event_id
FOR UPDATE SKIP LOCKED;

-- 2. If fewer rows came back than requested, or any seat is not free
--    (status = 'held' with an unexpired hold, or 'sold'), ROLLBACK and return 409.

-- 3. Create the hold and attach the seats to it.
INSERT INTO holds (user_id, event_id, expires_at)
VALUES (:user_id, :event_id, now() + interval '10 minutes')
RETURNING id;

UPDATE seats
SET status = 'held', hold_id = :hold_id, version = version + 1
WHERE id = ANY(:seat_ids);

COMMIT;
```

Because the rows are locked from step 1 until `COMMIT`, two buyers can never both pass the "is it free?" check for the same seat.

### Option B: optimistic locking with a version column

No locks are held. Each seat is updated only if its version is still the one that was read, so if someone changed it in between, the update affects 0 rows.

```sql
-- The app first reads the seat: SELECT id, status, version FROM seats WHERE id = :seat_id;
-- then tries to claim it, passing the version it saw:

UPDATE seats
SET status = 'held',
    hold_id = :hold_id,
    version = version + 1
WHERE id = :seat_id
  AND version = :version_seen        -- nobody has changed it since we read it
  AND status = 'available';

-- 1 row changed: we own the seat.
-- 0 rows changed: someone else changed it first, so ROLLBACK and return 409.
```

### Which one to use

For a big sale I would use **Option A with `SKIP LOCKED`**. Hundreds of people compete for the same good seats, so with optimistic locking most attempts would fail and retry, which wastes work. Locking makes each seat's winner decided in one short step. Option B is simpler and holds no locks, so it suits normal days with little competition.

### Expiring holds

A background worker frees seats from expired holds. The purchase transaction also checks `holds.expires_at` itself, so an expired hold can never be paid for even if the worker is late:

```sql
UPDATE seats
SET status = 'available', hold_id = NULL, version = version + 1
WHERE hold_id IN (
  SELECT id FROM holds WHERE status = 'active' AND expires_at < now()
);

UPDATE holds SET status = 'expired'
WHERE status = 'active' AND expires_at < now();
```

### Converting a hold into a purchase

The `tickets.seat_id UNIQUE` constraint remains as the last line of defence. The purchase transaction locks the hold, checks that it is still active and unexpired, creates the order and tickets, marks the seats `sold`, and sets the hold to `converted`. All of this happens in one transaction.