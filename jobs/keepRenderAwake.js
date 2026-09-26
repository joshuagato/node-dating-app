const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL; // Render automatically provides this env var

exports.keepRenderAwake = () => {
    if (BACKEND_BASE_URL) {
        const PING_INTERVAL = 12 * 60 * 1000; // 12 minutes in milliseconds

        setInterval(async () => {
            try {
                const response = await fetch(`${BACKEND_BASE_URL}`);
                console.log(`[Keep-Alive] Ping status: ${response.status}`);
            } catch (error) {
                console.error('[Keep-Alive] Ping failed:', error.message);
            }
        }, PING_INTERVAL);

        console.log(`Keep-alive script initialized for ${BACKEND_BASE_URL}`);
    } else {
        console.log('Keep-alive script skipped (Not running in production or BACKEND_BASE_URL missing)');
    }
}