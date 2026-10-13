const path = require("path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env"), quiet: true });

const dbName = process.env.DB_NAME || "shipspace_test_phase5";

const pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    database: dbName,
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD,
    options: "-c search_path=shipspace,public",
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
    console.error("Unexpected PostgreSQL pool error:", err.message);
});

/**
 * Executes a callback inside an explicit PostgreSQL transaction (BEGIN ... COMMIT/ROLLBACK)
 * with search_path set to shipspace, public.
 *
 * @param {(client: import('pg').PoolClient) => Promise<any>} callback
 */
pool.withTransaction = async (callback) => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("SET LOCAL search_path TO shipspace, public");
        const result = await callback(client);
        await client.query("COMMIT");
        return result;
    } catch (err) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackErr) {
            console.error("Transaction rollback error:", rollbackErr.message);
        }
        throw err;
    } finally {
        client.release();
    }
};

module.exports = pool;