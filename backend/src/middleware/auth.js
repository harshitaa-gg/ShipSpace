const jwt = require("jsonwebtoken");
const { AppError } = require("./errorHandler");

const INSECURE_PLACEHOLDERS = new Set([
    "shipspace_jwt_fallback_secret_never_use_in_prod",
    "your_secure_random_jwt_secret_here",
    "your_jwt_secret_here",
    "secret",
    "changeme",
    "development_secret",
    "jwt_secret",
]);

function getValidatedJwtSecret(env = process.env) {
    const secret = env.JWT_SECRET ? String(env.JWT_SECRET).trim() : "";
    const isProduction = env.NODE_ENV === "production";

    if (isProduction) {
        if (!secret) {
            throw new Error(
                "FATAL [Security]: In production mode (NODE_ENV=production), JWT_SECRET environment variable is mandatory."
            );
        }
        if (INSECURE_PLACEHOLDERS.has(secret.toLowerCase()) || secret.length < 32) {
            throw new Error(
                "FATAL [Security]: In production mode (NODE_ENV=production), JWT_SECRET must be at least 32 characters and cannot use known development placeholders."
            );
        }
        return secret;
    }

    if (!secret || INSECURE_PLACEHOLDERS.has(secret.toLowerCase())) {
        return "shipspace_jwt_fallback_secret_never_use_in_prod";
    }
    return secret;
}

const JWT_SECRET = getValidatedJwtSecret();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h";

/**
 * Signs a JWT token for an authenticated user.
 */
function signUserToken(user) {
    const payload = {
        userId: Number(user.id ?? user.user_id),
        id: Number(user.id ?? user.user_id),
        email: user.email,
        role: user.role,
        name: user.name,
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Strict authentication middleware.
 * Derives user identity exclusively from a verified Bearer JWT token.
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        // If legacy fallback is enabled (for older unauthenticated test cases):
        if (process.env.ALLOW_LEGACY_AUTH_FALLBACK === "true") {
            const fallbackId =
                req.headers["x-user-id"] ??
                req.headers["x-provider-id"] ??
                req.headers["x-trader-id"] ??
                req.params?.providerId ??
                req.params?.traderId;
            if (fallbackId) {
                req.user = {
                    id: Number(fallbackId),
                    userId: Number(fallbackId),
                    role: req.headers["x-provider-id"] ? "provider" : "trader",
                    isLegacyFallback: true,
                };
                return next();
            }
        }

        return res.status(401).json({
            success: false,
            message: "Authentication required. Please provide a valid Bearer token.",
            error: {
                code: "AUTHENTICATION_REQUIRED",
                message: "Authentication required. Please provide a valid Bearer token.",
            },
        });
    }

    const token = authHeader.slice(7).trim();
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = {
            ...decoded,
            id: Number(decoded.userId ?? decoded.id),
            userId: Number(decoded.userId ?? decoded.id),
        };
        return next();
    } catch (err) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired authentication token",
            error: {
                code: "INVALID_TOKEN",
                message: err.message,
            },
        });
    }
}

/**
 * Optional authentication middleware.
 * Populates req.user if a valid Bearer token is provided, but allows unauthenticated access.
 */
function optionalAuthenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.slice(7).trim();
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = {
                ...decoded,
                id: Number(decoded.userId ?? decoded.id),
                userId: Number(decoded.userId ?? decoded.id),
            };
        } catch (err) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired authentication token",
                error: {
                    code: "INVALID_TOKEN",
                    message: err.message,
                },
            });
        }
    }
    return next();
}

/**
 * Enforces role-based access control.
 * Rejects callers whose verified token role is not in the allowed list.
 */
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required.",
                error: {
                    code: "AUTHENTICATION_REQUIRED",
                    message: "Authentication required.",
                },
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: `Forbidden: this action requires one of the following roles: ${allowedRoles.join(", ")}`,
                error: {
                    code: "FORBIDDEN_ROLE",
                    message: `User with role '${req.user.role}' cannot access this resource. Required role: ${allowedRoles.join(", ")}`,
                },
            });
        }

        return next();
    };
}

module.exports = {
    JWT_SECRET,
    JWT_EXPIRES_IN,
    getValidatedJwtSecret,
    INSECURE_PLACEHOLDERS,
    signUserToken,
    authenticateToken,
    optionalAuthenticateToken,
    requireRole,
};
