# Phase 6C: Index Performance Evidence & Query Plan Analysis

**Project**: ShipSpace LCL Capacity Marketplace  
**Database**: `shipspace_test_phase5`  
**Target Query**: Trader Multi-Constraint Capacity Matching Search (Section 1.1 / Strategy A)  
**Tuned Index**: `shipspace.idx_capacity_listing_search_open` on `capacity_listing(route_id, departure_date, cutoff_date) WHERE status = 'open'`

---

## 1. Executive Summary & Query Plan Mechanics

When evaluating PostgreSQL query plans for indexed tables, the cost-based optimizer evaluates:
$$\text{Cost} = (\text{Disk Pages Read} \times \text{seq\_page\_cost}) + (\text{Tuples Processed} \times \text{cpu\_tuple\_cost}) + (\text{Index Pages/Tuples})$$

### Observations Across Dataset Scales:
1. **Small Seed Dataset (45 Listings, 1–2 Disk Pages)**:
   - In small tables fitting in a single buffer page ($8\text{ KB}$), a sequential scan has a low cost. However, because our partial composite index `idx_capacity_listing_search_open` is present with `ANALYZE` statistics, the optimizer actively selected an **Index Scan** for `capacity_listing` within the nested loop join (cost=0.15..0.88, actual time=0.052..0.056 ms, loops=4).
   - In Test 3, when dropping the indexes inside a rollback transaction, the optimizer had to fall back to a **Seq Scan** on `shipspace.capacity_listing` (cost=0.00..3.69, actual time=0.041..0.070 ms) and a Hash Join against the route table.
2. **Production Scale Benchmark (20,000 Listings)**:
   - When table volume increases to 20,000 rows across 264 buffer blocks:
     - **Without Index**: Full `Seq Scan` filtering 19,333 non-matching rows, taking **14.625 ms** execution time.
     - **With Partial Composite Index**: `Bitmap Heap Scan` via `Bitmap Index Scan on idx_temp_search_open`, directly identifying the 667 matching rows with an execution time of **1.143 ms**.
     - **Speedup**: **~12.8× execution time reduction** on this run (14.625 ms vs. 1.143 ms), with identical query results (667 rows returned).

---

## 2. Experimental Execution Plans (Captured from Test Database)

The benchmark was executed using `test_explain_benchmark.sql` against `shipspace_test_phase5` with PostgreSQL 18.

### Test 1: Seed Dataset Plan (With Indexes Active)
```text
Sort  (cost=18.85..18.86 rows=1 width=1675) (actual time=0.684..0.687 rows=4.00 loops=1)
  Output: l.id, p.company_name, orig.name, orig.un_locode, dest.name, dest.un_locode, l.cutoff_date, l.departure_date, l.arrival_date, r.typical_transit_days, l.available_cbm, l.available_weight, l.price_per_cbm, l.price_per_tonne, l.minimum_charge, (GREATEST(round((3.50 * l.price_per_cbm), 2), round((2.00 * l.price_per_tonne), 2), l.minimum_charge))
  Sort Key: (GREATEST(round((3.50 * l.price_per_cbm), 2), round((2.00 * l.price_per_tonne), 2), l.minimum_charge)), l.departure_date
  Sort Method: quicksort  Memory: 25kB
  Buffers: shared hit=83
  ->  Nested Loop  (cost=8.91..18.84 rows=1 width=1675) (actual time=0.462..0.615 rows=4.00 loops=1)
        Inner Unique: true
        Buffers: shared hit=77
        ->  Nested Loop  (cost=8.75..16.76 rows=5 width=1651) (actual time=0.394..0.501 rows=20.00 loops=1)
              Buffers: shared hit=67
              ->  Nested Loop  (cost=8.61..16.04 rows=1 width=1643) (actual time=0.361..0.443 rows=4.00 loops=1)
                    Inner Unique: true
                    Buffers: shared hit=59
                    ->  Nested Loop  (cost=8.47..11.86 rows=1 width=1111) (actual time=0.345..0.409 rows=9.00 loops=1)
                          Inner Unique: true
                          Buffers: shared hit=41
                          ->  Nested Loop  (cost=8.32..10.37 rows=1 width=603) (actual time=0.319..0.365 rows=9.00 loops=1)
                                Buffers: shared hit=23
                                ->  Hash Join  (cost=8.17..9.48 rows=1 width=560) (actual time=0.122..0.132 rows=4.00 loops=1)
                                      Inner Unique: true
                                      Hash Cond: (r.origin_port_id = orig.id)
                                      Buffers: shared hit=3
                                      ->  Seq Scan on shipspace.route r  (cost=0.00..1.24 rows=24 width=28) (actual time=0.035..0.037 rows=24.00 loops=1)
                                      ->  Hash  (cost=8.16..8.16 rows=1 width=548) (actual time=0.069..0.070 rows=1.00 loops=1)
                                            Buffers: shared hit=2
                                            ->  Index Scan using uq_port_un_locode on shipspace.port orig  (cost=0.14..8.16 rows=1 width=548) (actual time=0.053..0.054 rows=1.00 loops=1)
                                                  Index Cond: (orig.un_locode = 'INNSA'::bpchar)
                                ->  Index Scan using idx_capacity_listing_search_open on shipspace.capacity_listing l  (cost=0.15..0.88 rows=2 width=59) (actual time=0.052..0.056 rows=2.25 loops=4)
                                      Index Cond: ((l.route_id = r.id) AND (l.departure_date > (CURRENT_DATE + 2)) AND (l.cutoff_date >= CURRENT_DATE) AND (l.cutoff_date >= (CURRENT_DATE + 2)))
                                      Filter: ((l.available_cbm >= 3.50) AND (l.available_weight >= 2.00))
                                      Buffers: shared hit=20
                          ->  Index Scan using pk_provider on shipspace.provider p  (cost=0.14..1.46 rows=1 width=524) (actual time=0.004..0.004 rows=1.00 loops=9)
                    ->  Index Scan using pk_port dest  (cost=0.14..2.16 rows=1 width=548) (actual time=0.003..0.003 rows=0.44 loops=9)
                          Filter: (dest.un_locode = 'AEJEA'::bpchar)
              ->  Index Only Scan using pk_listing_cargo lc  (cost=0.14..0.66 rows=5 width=16) (actual time=0.010..0.012 rows=5.00 loops=4)
                    Index Cond: (lc.listing_id = l.id)
        ->  Memoize  (cost=0.16..0.40 rows=1 width=8) (actual time=0.003..0.003 rows=0.20 loops=20)
              ->  Index Scan using pk_cargo_type ct  (cost=0.15..0.39 rows=1 width=8) (actual time=0.010..0.010 rows=0.20 loops=5)
Planning Time: 48.555 ms | Execution Time: 1.063 ms
```

### Test 2: Forced Index Scan Plan (`SET enable_seqscan = off`)
```text
Sort  (cost=25.70..25.71 rows=1 width=1675) (actual time=0.551..0.555 rows=4.00 loops=1)
  ...
  ->  Nested Loop  (cost=0.28..16.33 rows=1 width=560) (actual time=0.240..0.245 rows=4.00 loops=1)
        ->  Index Scan using uq_port_un_locode on shipspace.port orig  (cost=0.14..8.16 rows=1 width=548) (actual time=0.206..0.207 rows=1.00 loops=1)
        ->  Index Scan using uq_route_ports on shipspace.route r  (cost=0.14..8.15 rows=1 width=28) (actual time=0.025..0.027 rows=4.00 loops=1)
  ->  Index Scan using idx_capacity_listing_search_open on shipspace.capacity_listing l  (cost=0.15..0.88 rows=2 width=59) (actual time=0.013..0.016 rows=2.25 loops=4)
        Index Cond: ((l.route_id = r.id) AND (l.departure_date > (CURRENT_DATE + 2)) AND (l.cutoff_date >= CURRENT_DATE) AND (l.cutoff_date >= (CURRENT_DATE + 2)))
        Filter: ((l.available_cbm >= 3.50) AND (l.available_weight >= 2.00))
Planning Time: 2.640 ms | Execution Time: 0.820 ms
```

### Test 3: Transaction-Safe Plan Without Indexes (Inside ROLLBACK)
```text
Sort  (cost=21.81..21.82 rows=1 width=1675) (actual time=0.337..0.341 rows=4.00 loops=1)
  ...
  ->  Hash Join  (cost=9.49..13.33 rows=1 width=603) (actual time=0.136..0.176 rows=9.00 loops=1)
        Hash Cond: (l.route_id = r.id)
        ->  Seq Scan on shipspace.capacity_listing l  (cost=0.00..3.69 rows=37 width=59) (actual time=0.041..0.070 rows=38.00 loops=1)
              Filter: ((available_cbm >= 3.50) AND (available_weight >= 2.00) AND ((status)::text = 'open'::text) AND (cutoff_date >= CURRENT_DATE) AND (departure_date > (CURRENT_DATE + 2)))
              Rows Removed by Filter: 7
              Buffers: shared hit=2
        ->  Hash  (cost=9.48..9.48 rows=1 width=560) (actual time=0.080..0.081 rows=4.00 loops=1)
Planning Time: 7.997 ms | Execution Time: 0.544 ms
```
*(Notice: Once `idx_capacity_listing_search_open` was dropped, PostgreSQL fell back to a Sequential Scan on `capacity_listing` filtering rows sequentially).*

---

### Test 4: Scaled Production Benchmark (20,000 Rows, Synthetic Temp Table)

A temporary unlogged table of 20,000 listing rows was generated simulating 30 distinct routes, realistic statuses, and future departure dates.

#### Plan A: Without Index (Sequential Scan)
```text
Seq Scan on temp_scaled_listings  (cost=0.00..864.00 rows=533 width=17) (actual time=0.045..14.513 rows=667.00 loops=1)
  Filter: ((available_cbm >= 3.50) AND (route_id = 1) AND ((status)::text = 'open'::text) AND (cutoff_date >= CURRENT_DATE) AND (departure_date > (CURRENT_DATE + 2)))
  Rows Removed by Filter: 19333
  Buffers: local hit=264
Planning Time: 40.491 ms
Execution Time: 14.625 ms
```

#### Plan B: With Partial Composite Index (`idx_temp_search_open`)
```text
Bitmap Heap Scan on temp_scaled_listings  (cost=12.75..296.73 rows=533 width=17) (actual time=0.216..0.733 rows=667.00 loops=1)
  Recheck Cond: ((route_id = 1) AND (departure_date > (CURRENT_DATE + 2)) AND (cutoff_date >= CURRENT_DATE) AND ((status)::text = 'open'::text))
  Filter: (available_cbm >= 3.50)
  Heap Blocks: exact=264
  Buffers: shared hit=3, local hit=264 read=2
  ->  Bitmap Index Scan on idx_temp_search_open  (cost=0.00..12.62 rows=666 width=0) (actual time=0.157..0.158 rows=667.00 loops=1)
        Index Cond: ((route_id = 1) AND (departure_date > (CURRENT_DATE + 2)) AND (cutoff_date >= CURRENT_DATE))
        Buffers: shared hit=3, local read=2
Planning Time: 0.379 ms
Execution Time: 1.143 ms
```

#### Metric Comparison Summary:

| Metric | Without Index (Plan A) | With Index (Plan B) | Improvement |
| :--- | :--- | :--- | :--- |
| **Scan Strategy** | `Seq Scan` (Full table scan) | `Bitmap Index Scan` + `Bitmap Heap Scan` | Targeted access |
| **Rows Evaluated / Filtered** | 20,000 scanned / 19,333 discarded | Direct match / 0 discarded | Elimination of scanning non-matching rows |
| **Matching Rows Returned** | 667 rows | 667 rows | Exact 1:1 result equivalence |
| **Estimated Cost** | $864.00$ | $296.73$ | **65.6% lower cost** |
| **Execution Time** | **14.625 ms** | **1.143 ms** | **~12.8× faster execution** |
| **Transaction Disposition** | Rolled back (`ROLLBACK`) | Rolled back (`ROLLBACK`) | Zero persistent data pollution |

*(Note on previous benchmark runs: across different synthetic data distributions and warm-up cycles, execution times typically range between 12× and 13× faster, e.g. 25.1 ms down to 2.0 ms or 14.6 ms down to 1.1 ms).*

---

## 3. Analysis, Scope & Practical Limitations

1. **Safety and Non-Invasiveness**:
   - The benchmark was executed strictly inside rolled-back transactions (`BEGIN ... ROLLBACK`).
   - The primary database `shipspace_db` was never accessed or modified. All tests ran on `shipspace_test_phase5`.
2. **Partial Index Space Efficiency**:
   - The partial clause `WHERE status = 'open'` keeps historical, departed, cancelled, and filled listings out of the index tree. In high-turnover logistics platforms where 80%+ of historical records are completed or archived, this preserves index cache locality and minimizes B-tree rebalancing overhead.
3. **Engineering Limitations**:
   - **Synthetic vs. Production Data**: The 20,000-row test used synthetic pseudo-random data to demonstrate scaling behavior; real production distributions may have route skew and varying cargo requirements.
   - **Single Execution Timing**: Specific millisecond timings are subject to CPU scheduling, operating system page cache warmth, and background disk activity; they should be interpreted as demonstrating relative algorithmic scaling rather than fixed production guarantees.
