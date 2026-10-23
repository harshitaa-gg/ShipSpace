#!/bin/sh
set -e

echo "==> [ShipSpace DB Init] Starting database initialization..."

# 1. Create schema 'shipspace' if not already created
echo "==> [ShipSpace DB Init] Ensuring schema 'shipspace' exists..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE SCHEMA IF NOT EXISTS shipspace;
EOSQL

# 2. Run sequential migrations in strict dependency order
# Note: 00_reset.sql drops the schema and is excluded to protect volume data.
# Roles and concurrency test scripts (06, 07, test_concurrency_*.sql) are excluded.
MIGRATIONS="
    /sql/01_schema.sql
    /sql/02_seed_data.sql
    /sql/03_views.sql
    /sql/04_indexes.sql
    /sql/05_functions_triggers.sql
    /sql/09_feature_a_all_in_cost.sql
    /sql/10_feature_b_timelines_docs_rollover.sql
"

for file in $MIGRATIONS; do
    if [ -f "$file" ]; then
        echo "==> [ShipSpace DB Init] Executing: $file"
        psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$file"
    else
        echo "==> [ShipSpace DB Init] ERROR: Migration file $file not found!"
        exit 1
    fi
done

echo "==> [ShipSpace DB Init] Database initialized successfully."
