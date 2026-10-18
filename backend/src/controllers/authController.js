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
    } = req.body;

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

module.exports = {
    register,
};
