const referenceService = require("../services/referenceService");
const { asyncHandler } = require("../middleware/errorHandler");
const {
    parsePositiveInt,
    parseOptionalPositiveInt,
    parseUnLocode,
    parseNonEmptyString,
} = require("../middleware/validate");

const getPorts = asyncHandler(async (req, res) => {
    const ports = await referenceService.getAllPorts();
    res.json({
        success: true,
        count: ports.length,
        data: ports,
    });
});

const createPort = asyncHandler(async (req, res) => {
    const name = parseNonEmptyString(req.body.name, "name", 255);
    const country = parseNonEmptyString(req.body.country, "country", 100);
    const un_locode = parseUnLocode(req.body.un_locode, "un_locode");
    const admin_id = parseOptionalPositiveInt(req.body.admin_id, "admin_id");

    const port = await referenceService.createPort({ name, country, un_locode, admin_id });
    res.status(201).json({
        success: true,
        message: "Port created successfully",
        data: port,
    });
});

const getRoutes = asyncHandler(async (req, res) => {
    const routes = await referenceService.getAllRoutes();
    res.json({
        success: true,
        count: routes.length,
        data: routes,
    });
});

const createRoute = asyncHandler(async (req, res) => {
    const origin_port_id = parsePositiveInt(req.body.origin_port_id, "origin_port_id");
    const destination_port_id = parsePositiveInt(req.body.destination_port_id, "destination_port_id");
    const typical_transit_days = parsePositiveInt(req.body.typical_transit_days, "typical_transit_days");
    const admin_id = parseOptionalPositiveInt(req.body.admin_id, "admin_id");

    const route = await referenceService.createRoute({
        origin_port_id,
        destination_port_id,
        typical_transit_days,
        admin_id,
    });
    res.status(201).json({
        success: true,
        message: "Route created successfully",
        data: route,
    });
});

const getCargoTypes = asyncHandler(async (req, res) => {
    const cargoTypes = await referenceService.getAllCargoTypes();
    res.json({
        success: true,
        count: cargoTypes.length,
        data: cargoTypes,
    });
});

const createCargoType = asyncHandler(async (req, res) => {
    const name = parseNonEmptyString(req.body.name, "name", 100);
    const description =
        req.body.description !== undefined && req.body.description !== null
            ? String(req.body.description).trim()
            : null;
    const admin_id = parseOptionalPositiveInt(req.body.admin_id, "admin_id");

    const cargoType = await referenceService.createCargoType({ name, description, admin_id });
    res.status(201).json({
        success: true,
        message: "Cargo type created successfully",
        data: cargoType,
    });
});

const getChargeTypes = asyncHandler(async (req, res) => {
    const stage = req.query.stage ? String(req.query.stage).trim().toLowerCase() : null;
    const chargeTypes = await referenceService.getStandardChargeTypes({ stage });
    res.json({
        success: true,
        count: chargeTypes.length,
        data: chargeTypes,
    });
});

const getMilestoneTypes = asyncHandler(async (req, res) => {
    const milestoneTypes = await referenceService.getStandardMilestoneTypes();
    res.json({
        success: true,
        count: milestoneTypes.length,
        data: milestoneTypes,
    });
});

module.exports = {
    getPorts,
    createPort,
    getRoutes,
    createRoute,
    getCargoTypes,
    createCargoType,
    getChargeTypes,
    getMilestoneTypes,
};
