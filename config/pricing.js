// Central pricing config.
//
// Every region has:
//   - displayCurrency : what the user sees on the page
//   - prices          : prices in the display currency (smallest unit)
//
// Paystack charges in GHS for all regions. The GHS charge is computed by
// converting the USD-equivalent of the local price at a fixed rate, then
// rounding UP to the nearest 0.50 GHS. Rounding up ensures we never
// undercharge; the small buffer covers FX fluctuation and card fees.
//
// The fixed USD->GHS rate should be updated periodically (weekly is fine
// for a dating app). If you later add a live FX feed, replace the constant
// with a cached lookup and keep the same shape.

const USD_TO_GHS = 11.62;          // update periodically
const GHS_ROUNDING_STEP = 50;      // round UP to nearest 0.50 GHS (50 pesewas)
const GHS_MIN_CHARGE = 100;        // floor: 1.00 GHS, so we never charge 0

// USD reference tiers (same as before, in USD cents)
const USD_TIERS = {
    tier_high: { weekly: 300, monthly: 900, quarterly: 2295, semiannual: 4050, annual: 6480 },
    tier_mid: { weekly: 250, monthly: 700, quarterly: 1785, semiannual: 3150, annual: 5040 },
    tier_low: { weekly: 200, monthly: 500, quarterly: 1275, semiannual: 2250, annual: 3600 },
};

// Rough local-currency-per-USD rates for display pricing.
// These are approximate; the point is to show a familiar local price,
// not to be FX-precise. Update alongside USD_TO_GHS.
const LOCAL_PER_USD = {
    GBP: 0.79, EUR: 0.92, GHS: 11.62, NGN: 1320, ZAR: 16.5, USD: 1,
};

const PRICING = {
    // =====================================================================
    // Ghana — display and charge in GHS
    // =====================================================================
    gh: {
        displayCurrency: 'GHS',
        prices: {
            weekly: 2000, monthly: 5000, quarterly: 12750,
            semiannual: 22500, annual: 36000,
        },
    },
    // =====================================================================
    // Nigeria — display NGN, charge GHS
    // =====================================================================
    ng: {
        displayCurrency: 'NGN',
        prices: {
            weekly: 250000, monthly: 600000, quarterly: 1530000,
            semiannual: 2700000, annual: 4320000,
        },
    },
    // =====================================================================
    // South Africa — display ZAR, charge GHS
    // =====================================================================
    za: {
        displayCurrency: 'ZAR',
        prices: {
            weekly: 3000, monthly: 8000, quarterly: 20400,
            semiannual: 36000, annual: 57600,
        },
    },
    // =====================================================================
    // UK — display GBP, charge GHS
    // =====================================================================
    gb: {
        displayCurrency: 'GBP',
        prices: {
            weekly: 270, monthly: 800, quarterly: 2040,
            semiannual: 3600, annual: 5760,
        },
    },
    // =====================================================================
    // Eurozone — display EUR, charge GHS
    // =====================================================================
    ...Object.fromEntries(
        [
            'de', 'fr', 'es', 'it', 'nl', 'be', 'at', 'ch', 'se', 'no', 'dk', 'fi',
            'ie', 'pt', 'pl', 'gr', 'cz', 'ro', 'hu', 'bg', 'hr', 'sk', 'si', 'lt',
            'lv', 'ee', 'lu', 'mt', 'cy',
        ].map((code) => [code, {
            displayCurrency: 'EUR',
            prices: {
                weekly: 300, monthly: 900, quarterly: 2295,
                semiannual: 4050, annual: 6480,
            },
        }])
    ),
    // =====================================================================
    // US, Canada, Australia, NZ — display USD, charge GHS
    // =====================================================================
    us: { displayCurrency: 'USD', prices: { weekly: 400, monthly: 1000, quarterly: 2200, semiannual: 3800, annual: 6000 } },
    ca: { displayCurrency: 'USD', prices: USD_TIERS.tier_high },
    au: { displayCurrency: 'USD', prices: USD_TIERS.tier_high },
    nz: { displayCurrency: 'USD', prices: USD_TIERS.tier_high },

    // =====================================================================
    // Mid-tier markets — display USD, charge GHS
    // =====================================================================
    ...Object.fromEntries(
        ['in', 'pk', 'bd', 'ph', 'vn', 'id', 'th', 'my', 'lk'].map((code) => [code, {
            displayCurrency: 'USD',
            prices: USD_TIERS.tier_mid,
        }])
    ),
    ...Object.fromEntries(
        ['br', 'co', 'ar', 'pe', 'cl', 'ec'].map((code) => [code, {
            displayCurrency: 'USD',
            prices: USD_TIERS.tier_mid,
        }])
    ),
    ...Object.fromEntries(
        ['jp', 'kr', 'sg', 'ae', 'sa', 'il', 'tw', 'hk'].map((code) => [code, {
            displayCurrency: 'USD',
            prices: USD_TIERS.tier_high,
        }])
    ),
    ...Object.fromEntries(
        [
            'bw', 'cm', 'ke', 'ls', 'lr', 'mw', 'mu', 'na', 'rw', 'sc',
            'sl', 'so', 'ss', 'sd', 'sz', 'tz', 'ug', 'zm', 'zw',
        ].map((code) => [code, {
            displayCurrency: 'USD',
            prices: USD_TIERS.tier_low,
        }])
    ),
};

const DEFAULT_PRICING = {
    displayCurrency: 'USD',
    prices: USD_TIERS.tier_mid,
};

const BILLING_CYCLES = ['weekly', 'monthly', 'quarterly', 'semiannual', 'annual'];

function getPricingForCountry(countryCode) {
    const code = (countryCode || '').toLowerCase();
    return PRICING[code] || DEFAULT_PRICING;
}

/**
 * Convert the local display price into a GHS charge.
 *
 * Steps:
 *   1. Convert local amount (smallest unit) -> USD cents
 *      using the LOCAL_PER_USD table.
 *   2. Convert USD cents -> GHS pesewas using USD_TO_GHS.
 *   3. Round UP to the nearest GHS_ROUNDING_STEP.
 *   4. Clamp to GHS_MIN_CHARGE.
 *
 * Rounding UP ensures the user is never undercharged. The tiny buffer
 * (up to 0.49 GHS) also absorbs FX drift between updates.
 */
function computeGhsCharge(region, billingCycle) {
    const localAmount = region.prices[billingCycle];
    const localCurrency = region.displayCurrency;

    // Fast path: already GHS
    if (localCurrency === 'GHS') {
        return {
            chargeAmount: localAmount,
            chargeCurrency: 'GHS',
        };
    }

    const localPerUsd = LOCAL_PER_USD[localCurrency] || 1;

    // Local smallest unit -> USD cents
    // e.g. 800 GBP pence / 0.79 GBP-per-USD = 1012.66 USD cents
    // (because 800 pence = £8, £8 / 0.79 ≈ $10.13)
    //
    // Note: prices are stored in smallest unit (pence, cents).
    // Dividing by LOCAL_PER_USD converts the smallest unit to USD smallest
    // unit only because we treat 1 local-unit = 1/100 currency and 1 USD
    // = 100 cents. That ratio holds for all our currencies (all 2-decimal).
    const usdCents = localAmount / localPerUsd;

    // USD cents -> GHS pesewas
    // 1 USD = 100 cents = 11.62 GHS = 1162 pesewas
    const ghsPesewas = usdCents * (USD_TO_GHS * 100 / 100);
    // Simplify: ghsPesewas = usdCents * USD_TO_GHS

    const ghsRaw = ghsPesewas;

    // Round UP to nearest 0.50 GHS
    const rounded = Math.ceil(ghsRaw / GHS_ROUNDING_STEP) * GHS_ROUNDING_STEP;

    return {
        chargeAmount: Math.max(rounded, GHS_MIN_CHARGE),
        chargeCurrency: 'GHS',
    };
}

module.exports = {
    PRICING,
    DEFAULT_PRICING,
    BILLING_CYCLES,
    USD_TO_GHS,
    getPricingForCountry,
    computeGhsCharge,
};