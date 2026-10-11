const { AppError } = require("./errorHandler");

function parsePositiveInt(value, fieldName) {
    if (value === undefined || value === null || value === "") {
        throw new AppError(`${fieldName} is required`, 400, "VALIDATION_ERROR");
    }
    const num = Number(value);
    if (!Number.isInteger(num) || num <= 0) {
        throw new AppError(`${fieldName} must be a positive integer`, 400, "VALIDATION_ERROR");
    }
    return num;
}

function parseOptionalPositiveInt(value, fieldName) {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    return parsePositiveInt(value, fieldName);
}

function parsePositiveNumber(value, fieldName) {
    if (value === undefined || value === null || value === "") {
        throw new AppError(`${fieldName} is required`, 400, "VALIDATION_ERROR");
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
        throw new AppError(`${fieldName} must be a positive number greater than 0`, 400, "VALIDATION_ERROR");
    }
    return Number(num.toFixed(2));
}

function parseNonNegativeNumber(value, fieldName) {
    if (value === undefined || value === null || value === "") {
        throw new AppError(`${fieldName} is required`, 400, "VALIDATION_ERROR");
    }
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0) {
        throw new AppError(`${fieldName} must be a non-negative number`, 400, "VALIDATION_ERROR");
    }
    return Number(num.toFixed(2));
}

function parseDateString(value, fieldName) {
    if (value === undefined || value === null || String(value).trim() === "") {
        throw new AppError(`${fieldName} is required (YYYY-MM-DD)`, 400, "VALIDATION_ERROR");
    }
    const str = String(value).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        throw new AppError(`${fieldName} must be a valid date in YYYY-MM-DD format`, 400, "VALIDATION_ERROR");
    }
    const parsed = new Date(`${str}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== str) {
        throw new AppError(`${fieldName} is not a valid calendar date`, 400, "VALIDATION_ERROR");
    }
    return str;
}

function parseUnLocode(value, fieldName = "un_locode") {
    if (value === undefined || value === null || String(value).trim() === "") {
        throw new AppError(`${fieldName} is required`, 400, "VALIDATION_ERROR");
    }
    const code = String(value).trim().toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{3}$/.test(code)) {
        throw new AppError(
            `${fieldName} must be a 5-character UN/LOCODE matching ^[A-Z]{2}[A-Z0-9]{3}$ (e.g., INNSA, SGSIN)`,
            400,
            "VALIDATION_ERROR"
        );
    }
    return code;
}

function parseNonEmptyString(value, fieldName, maxLength = 255) {
    if (value === undefined || value === null || String(value).trim() === "") {
        throw new AppError(`${fieldName} is required and cannot be empty`, 400, "VALIDATION_ERROR");
    }
    const str = String(value).trim();
    if (str.length > maxLength) {
        throw new AppError(`${fieldName} cannot exceed ${maxLength} characters`, 400, "VALIDATION_ERROR");
    }
    return str;
}

module.exports = {
    parsePositiveInt,
    parseOptionalPositiveInt,
    parsePositiveNumber,
    parseNonNegativeNumber,
    parseDateString,
    parseUnLocode,
    parseNonEmptyString,
};
