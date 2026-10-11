class AppError extends Error {
    constructor(message, statusCode = 400, code = "BAD_REQUEST", details = null) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}

const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

const notFoundHandler = (req, res) => {
    const message = `Route not found: ${req.method} ${req.originalUrl}`;
    res.status(404).json({
        success: false,
        message,
        error: {
            code: "NOT_FOUND",
            message,
        },
    });
};

const errorHandler = (err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    // 1. Application-level structured errors
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({
            success: false,
            message: err.message,
            error: {
                code: err.code,
                message: err.message,
                ...(err.details ? { details: err.details } : {}),
            },
        });
    }

    // 2. Malformed JSON body
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        return res.status(400).json({
            success: false,
            message: "Malformed JSON payload in request body",
            error: {
                code: "INVALID_JSON",
                message: "Malformed JSON payload in request body",
            },
        });
    }

    // 3. PostgreSQL trigger / stored procedure exceptions (SQLSTATE P0001)
    if (err && err.code === "P0001") {
        const msg = err.message || "Database business rule violation";
        let statusCode = 400;
        let errorCode = "BUSINESS_RULE_VIOLATION";

        if (/does not exist/i.test(msg)) {
            statusCode = 404;
            errorCode = "RESOURCE_NOT_FOUND";
        } else if (
            /Insufficient available/i.test(msg) ||
            /is not open for booking/i.test(msg) ||
            /already been cancelled/i.test(msg) ||
            /already completed/i.test(msg) ||
            /already in status/i.test(msg)
        ) {
            statusCode = 409;
            errorCode = "BUSINESS_RULE_CONFLICT";
        }

        return res.status(statusCode).json({
            success: false,
            message: msg,
            error: {
                code: errorCode,
                sqlState: err.code,
                message: msg,
            },
        });
    }

    // 4. PostgreSQL constraint and data-type errors
    if (err && typeof err.code === "string") {
        // Unique constraint violation
        if (err.code === "23505") {
            const msg = err.detail || err.message || "Duplicate record violates uniqueness constraint";
            return res.status(409).json({
                success: false,
                message: msg,
                error: {
                    code: "UNIQUE_CONSTRAINT_VIOLATION",
                    sqlState: err.code,
                    constraint: err.constraint || null,
                    message: msg,
                },
            });
        }

        // Foreign key violation
        if (err.code === "23503") {
            const msg = err.detail || err.message || "Referenced entity does not exist or cannot be modified";
            return res.status(400).json({
                success: false,
                message: msg,
                error: {
                    code: "FOREIGN_KEY_VIOLATION",
                    sqlState: err.code,
                    constraint: err.constraint || null,
                    message: msg,
                },
            });
        }

        // Check constraint violation
        if (err.code === "23514") {
            const msg = `Database check constraint violated (${err.constraint || "check_constraint"}): ${err.message}`;
            return res.status(400).json({
                success: false,
                message: msg,
                error: {
                    code: "CHECK_CONSTRAINT_VIOLATION",
                    sqlState: err.code,
                    constraint: err.constraint || null,
                    message: msg,
                },
            });
        }

        // Invalid input syntax / date format
        if (["22P02", "22007", "22008", "22003"].includes(err.code)) {
            const msg = `Invalid parameter format: ${err.message}`;
            return res.status(400).json({
                success: false,
                message: msg,
                error: {
                    code: "INVALID_PARAMETER_FORMAT",
                    sqlState: err.code,
                    message: msg,
                },
            });
        }
    }

    console.error("Unhandled API Error:", err);

    return res.status(500).json({
        success: false,
        message: "Internal server error",
        error: {
            code: "INTERNAL_SERVER_ERROR",
            message: "An unexpected server error occurred",
        },
    });
};

module.exports = {
    AppError,
    asyncHandler,
    notFoundHandler,
    errorHandler,
};
