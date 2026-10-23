const authService = require("../services/authService");
const { asyncHandler } = require("../middleware/errorHandler");

const register = asyncHandler(async (req, res) => {
    const {
        name,
        email,
        password,
        role,
        company_name,
        gst_tax_id,
        contact_phone,
    } = req.body || {};

    const user = await authService.registerUser({
        name,
        email,
        password,
        role,
        company_name,
        gst_tax_id,
        contact_phone,
    });

    res.status(201).json({
        success: true,
        message: `Registered new ${user.role} account #${user.id} (${user.company_name})`,
        data: user,
    });
});

const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body || {};

    const result = await authService.loginUser({ email, password });

    res.json({
        success: true,
        message: `Authenticated as ${result.user.name} (${result.user.role})`,
        data: result,
    });
});

const getMe = asyncHandler(async (req, res) => {
    const user = await authService.getUserProfileById(req.user.id);

    res.json({
        success: true,
        data: user,
    });
});

module.exports = {
    register,
    login,
    getMe,
};
