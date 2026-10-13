const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });

const app = require("./src/app");

const PORT = Number(process.env.PORT) || 5000;

const server = app.listen(PORT, (err) => {
    if (err) {
        if (err.code === "EADDRINUSE") {
            console.error(
                `[ERROR] Port ${PORT} is already in use by another process (EADDRINUSE). ` +
                `Stop the other process using port ${PORT} before starting a new server instance.`
            );
        } else {
            console.error(`[ERROR] Failed to start ShipSpace backend:`, err.message);
        }
        process.exit(1);
    }

    console.log(`ShipSpace backend running on port ${PORT}`);
});

module.exports = server;