# SmartLCL Scope Note

**Purpose:** SmartLCL is a database-centred platform where logistics providers publish available LCL (Less-than-Container-Load) capacity and traders search for and book space that matches their shipment. The database enforces capacity correctness, so overbooking is prevented even under concurrent use.

## 1. User Roles

- **Provider:** A logistics company that publishes and manages LCL capacity listings and views the bookings made against them.
- **Trader:** An SME that searches for matching capacity, books space, and views or cancels their own bookings.
- **Admin:** Manages reference data such as ports, routes, and cargo types, oversees users, and views platform-wide reports.

## 2. Core Workflows

1. **Provider publishes capacity:** The provider enters the route, departure and arrival dates, cut-off date, total CBM, total weight, price, and allowed cargo types. The listing is saved as open, with available capacity initially equal to total capacity.

2. **Trader searches:** The trader enters origin, destination, required CBM, required weight, cargo type, and cargo-ready date. The system returns only open listings that satisfy all required constraints, sorted by price or departure date.

3. **Trader books:** The trader selects a listing and requests a quantity. In one database transaction, the system re-checks all booking rules, creates the booking, reduces the remaining CBM and weight, and confirms the booking.

4. **Cancellation (trader or provider):** The booking status becomes cancelled, the booked CBM and weight are returned to the listing, and the listing can reopen when capacity becomes available.

## 3. Key Business Rules

| ID | Rule | Enforcement |
|---|---|---|
| R1 | A booking can never exceed the remaining CBM or remaining weight. | Row locking, transaction-level re-checks, and CHECK constraints on available capacity. |
| R2 | The cargo type must be allowed on the listing. | Booking function/trigger checks the listing's allowed cargo types. |
| R3 | A booking must be made on or before the listing's cut-off date. | Booking function and database trigger. |
| R4 | Cancelling a booking restores the exact CBM and weight that were reserved. | Cancellation function and trigger. |
| R5 | Concurrent bookings must never cause overbooking. | `SELECT ... FOR UPDATE` on the listing row inside the booking transaction. |
| R6 | Only open listings can be booked; a listing with no remaining capacity becomes full. | Listing status logic and database constraints/triggers. |
| R7 | Quantities and prices must be positive; available capacity cannot exceed total capacity; arrival must be after departure; origin and destination must differ. | CHECK constraints. |
| R8 | A provider can modify only their own listings, and a trader can access only their own bookings. | Backend authorization checks and database roles where appropriate. |
| R9 | Bookings are never hard-deleted; cancelled bookings remain available for historical records and reporting. | Booking status and restrictive foreign-key design. |

## 4. Naming and Key Conventions

- **Naming style:** `snake_case` for all tables, columns, constraints, indexes, views, and functions.
- **Table names:** Singular. Examples: `user_account`, `provider`, `trader`, `port`, `capacity_listing`, and `booking`.
- **Primary keys:** `BIGINT GENERATED ALWAYS AS IDENTITY`, with the primary-key column named `id`.
- **Foreign keys:** Named using the referenced table plus `_id`, for example `listing_id`.
- **Constraint and index names:** Use prefixes such as `pk_`, `fk_`, `uq_`, `ck_`, and `idx_`.
- **Numeric values:** Use `NUMERIC` for CBM, weight, and monetary values; do not use floating-point types for these business quantities.
- **Time values:** Use `TIMESTAMPTZ` for event timestamps and `DATE` for shipment schedule dates.
- **Status values:** Use controlled values through CHECK constraints.
- **Audit columns:** Main tables should contain `created_at` and `updated_at` where appropriate.

## 5. Planned SQL File Series

The database scripts will be maintained as a numbered series:

- **00_reset.sql** — Drops database objects for a clean rebuild during development.
- **01_schema.sql** — Creates tables, primary keys, foreign keys, constraints, and core relationships.
- **02_seed_data.sql** — Inserts realistic sample data, including useful edge cases.
- **03_views.sql** — Creates views for trader, provider, and admin use cases.
- **04_indexes.sql** — Creates indexes for common searches, joins, and booking operations.
- **05_functions_triggers.sql** — Implements booking, cancellation, capacity enforcement, status management, and audit triggers.
- **06_roles.sql** — Defines optional PostgreSQL roles and permissions.
- **07_test_queries.sql** — Contains search tests, negative tests, capacity tests, concurrency test instructions, and reconciliation checks.

## 6. Out of Scope for Part 1

The following are outside the scope of the Part 1 database project:

- Payment processing
- Real-time vessel tracking
- Full authentication implementation
- React frontend development

These may be considered in later parts of the project.

## 7. Project Scope Summary

The primary goal of Part 1 is to build a reliable PostgreSQL database for LCL capacity discovery and booking. The database should correctly represent providers, traders, listings, cargo types, routes, and bookings while enforcing the core business rules at the database level. Particular attention will be given to transaction safety and concurrent bookings so that the system cannot overbook available capacity.
