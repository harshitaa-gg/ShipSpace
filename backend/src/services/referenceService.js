const pool = require("../config/db");
const { AppError } = require("../middleware/errorHandler");

async function getAllPorts() {
    const { rows } = await pool.query(
        `SELECT id, name, country, un_locode
         FROM port
         ORDER BY country ASC, name ASC`
    );
    return rows;
}

async function createPort({ name, country, un_locode, admin_id }) {
    return pool.withTransaction(async (client) => {
        if (admin_id !== null && admin_id !== undefined) {
            const adminCheck = await client.query(
                `SELECT id FROM admin WHERE id = $1`,
                [admin_id]
            );
            if (adminCheck.rowCount === 0) {
                throw new AppError(`Admin ID ${admin_id} does not exist`, 404, "ADMIN_NOT_FOUND");
            }
        }

        const { rows } = await client.query(
            `INSERT INTO port (name, country, un_locode)
             VALUES ($1, $2, $3)
             RETURNING id, name, country, un_locode`,
            [name, country, un_locode]
        );
        const port = rows[0];

        if (admin_id !== null && admin_id !== undefined) {
            await client.query(
                `INSERT INTO admin_port (admin_id, port_id) VALUES ($1, $2)`,
                [admin_id, port.id]
            );
        }

        return port;
    });
}

async function getAllRoutes() {
    const { rows } = await pool.query(
        `SELECT
            r.id AS route_id,
            r.origin_port_id,
            orig.name AS origin_port_name,
            orig.country AS origin_country,
            orig.un_locode AS origin_un_locode,
            r.destination_port_id,
            dest.name AS destination_port_name,
            dest.country AS destination_country,
            dest.un_locode AS destination_un_locode,
            orig.un_locode || ' -> ' || dest.un_locode AS route_code,
            r.typical_transit_days
         FROM route r
         JOIN port orig ON r.origin_port_id = orig.id
         JOIN port dest ON r.destination_port_id = dest.id
         ORDER BY orig.un_locode ASC, dest.un_locode ASC`
    );
    return rows;
}

async function createRoute({ origin_port_id, destination_port_id, typical_transit_days, admin_id }) {
    if (origin_port_id === destination_port_id) {
        throw new AppError(
            "origin_port_id and destination_port_id must be distinct ports (Rule R7)",
            400,
            "VALIDATION_ERROR"
        );
    }

    return pool.withTransaction(async (client) => {
        if (admin_id !== null && admin_id !== undefined) {
            const adminCheck = await client.query(
                `SELECT id FROM admin WHERE id = $1`,
                [admin_id]
            );
            if (adminCheck.rowCount === 0) {
                throw new AppError(`Admin ID ${admin_id} does not exist`, 404, "ADMIN_NOT_FOUND");
            }
        }

        const insertRes = await client.query(
            `INSERT INTO route (origin_port_id, destination_port_id, typical_transit_days)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [origin_port_id, destination_port_id, typical_transit_days]
        );
        const routeId = insertRes.rows[0].id;

        if (admin_id !== null && admin_id !== undefined) {
            await client.query(
                `INSERT INTO admin_route (admin_id, route_id) VALUES ($1, $2)`,
                [admin_id, routeId]
            );
        }

        const { rows } = await client.query(
            `SELECT
                r.id AS route_id,
                r.origin_port_id,
                orig.name AS origin_port_name,
                orig.country AS origin_country,
                orig.un_locode AS origin_un_locode,
                r.destination_port_id,
                dest.name AS destination_port_name,
                dest.country AS destination_country,
                dest.un_locode AS destination_un_locode,
                orig.un_locode || ' -> ' || dest.un_locode AS route_code,
                r.typical_transit_days
             FROM route r
             JOIN port orig ON r.origin_port_id = orig.id
             JOIN port dest ON r.destination_port_id = dest.id
             WHERE r.id = $1`,
            [routeId]
        );
        return rows[0];
    });
}

async function getAllCargoTypes() {
    const { rows } = await pool.query(
        `SELECT id, name, description
         FROM cargo_type
         ORDER BY id ASC`
    );
    return rows;
}

async function createCargoType({ name, description, admin_id }) {
    return pool.withTransaction(async (client) => {
        if (admin_id !== null && admin_id !== undefined) {
            const adminCheck = await client.query(
                `SELECT id FROM admin WHERE id = $1`,
                [admin_id]
            );
            if (adminCheck.rowCount === 0) {
                throw new AppError(`Admin ID ${admin_id} does not exist`, 404, "ADMIN_NOT_FOUND");
            }
        }

        const { rows } = await client.query(
            `INSERT INTO cargo_type (name, description)
             VALUES ($1, $2)
             RETURNING id, name, description`,
            [name, description || null]
        );
        const cargoType = rows[0];

        if (admin_id !== null && admin_id !== undefined) {
            await client.query(
                `INSERT INTO admin_cargo_type (admin_id, cargo_type_id) VALUES ($1, $2)`,
                [admin_id, cargoType.id]
            );
        }

        return cargoType;
    });
}

const { getStandardChargeTypes } = require("./pricingEngine");
const { getStandardMilestoneTypes } = require("./timelineService");

module.exports = {
    getAllPorts,
    createPort,
    getAllRoutes,
    createRoute,
    getAllCargoTypes,
    createCargoType,
    getStandardChargeTypes,
    getStandardMilestoneTypes,
};
