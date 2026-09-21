// Central pricing config.
//
// Each region has:
//   - displayCurrency : what the user sees on the page
//   - chargeCurrency  : what Paystack actually processes
//   - localPrices     : prices in the display currency (smallest unit)
//   - usdPrices       : prices in USD cents, used as the fallback charge
//                       amount when the display currency isn't supported by Paystack
//
// Rule: when converting local -> USD for charging, always round DOWN so
// the user is never charged more than their local price is worth.

const PAYSTACK_SUPPORTED = new Set(['GHS', 'NGN', 'ZAR', 'KES', 'USD']);

// USD-based helper for countries whose native currency Paystack doesn't support.
// These are the "reference" USD prices we use to price every other region.
const USD_TIERS = {
    // Rich Western markets
    tier_high: { weekly: 300, monthly: 900, quarterly: 2000, semiannual: 3500, annual: 5700 },
    // Mid-tier markets (parts of Asia, LATAM, Eastern Europe)
    tier_mid: { weekly: 200, monthly: 500, quarterly: 1200, semiannual: 2000, annual: 3500 },
    // Low-tier markets (Africa, South Asia)
    tier_low: { weekly: 150, monthly: 400, quarterly: 900, semiannual: 1500, annual: 2500 },
};

const PRICING = {
    // =========================================================================
    // Paystack-native currencies — display AND charge in local currency
    // =========================================================================
    gh: {
        displayCurrency: 'GHS',
        chargeCurrency: 'GHS',
        prices: {                    // smallest unit (pesewas)
            weekly: 2000,            // GHS 20.00
            monthly: 4000,           // GHS 40.00
            quarterly: 9000,         // GHS 90.00
            semiannual: 15000,       // GHS 150.00
            annual: 24000,           // GHS 240.00
        },
    },
    ng: {
        displayCurrency: 'NGN',
        chargeCurrency: 'NGN',
        prices: {
            weekly: 250000,          // ₦2,500
            monthly: 350000,         // ₦3,500
            quarterly: 1050000,      // ₦10,500
            semiannual: 1750000,     // ₦17,500
            annual: 2750000,         // ₦27,500
        },
    },
    za: {
        displayCurrency: 'ZAR',
        chargeCurrency: 'ZAR',
        prices: {
            weekly: 3000,            // R30
            monthly: 8000,           // R80
            quarterly: 20000,        // R200
            semiannual: 35000,       // R350
            annual: 55000,           // R550
        },
    },

    // =========================================================================
    // Stripe-of-the-world currencies — display in native, charge in USD
    // =========================================================================

    // --- United Kingdom ---
    gb: {
        displayCurrency: 'GBP',
        chargeCurrency: 'USD',
        prices: {                    // pence
            weekly: 200,             // £2.00
            monthly: 800,            // £8.00
            quarterly: 2100,         // £21.00
            semiannual: 3600,        // £36.00
            annual: 6000,            // £60.00
        },
        // USD equivalent (in cents) for the charge. Rounded DOWN.
        usdPrices: {
            weekly: 250,             // £2 ≈ $2.50
            monthly: 1000,           // £8 ≈ $10.00
            quarterly: 2600,         // £21 ≈ $26.00
            semiannual: 4500,        // £36 ≈ $45.00
            annual: 7500,            // £60 ≈ $75.00
        },
    },

    // --- Eurozone ---
    ...Object.fromEntries(
        [
            'de', 'fr', 'es', 'it', 'nl', 'be', 'at', 'ch', 'se', 'no', 'dk', 'fi',
            'ie', 'pt', 'pl', 'gr', 'cz', 'ro', 'hu', 'bg', 'hr', 'sk', 'si', 'lt',
            'lv', 'ee', 'lu', 'mt', 'cy',
        ].map((code) => [code, {
            displayCurrency: 'EUR',
            chargeCurrency: 'USD',
            prices: {                // euro cents
                weekly: 300,         // €3.00
                monthly: 900,        // €9.00
                quarterly: 2100,     // €21.00
                semiannual: 3600,    // €36.00
                annual: 6000,        // €60.00
            },
            usdPrices: {
                weekly: 350,
                monthly: 1100,
                quarterly: 2800,
                semiannual: 4800,
                annual: 8000,
            },
        }])
    ),

    // --- US, Canada, Australia, New Zealand ---
    us: {
        displayCurrency: 'USD',
        chargeCurrency: 'USD',
        prices: {
            weekly: 400, monthly: 1000, quarterly: 2200,
            semiannual: 3800, annual: 6000,
        },
    },
    ca: {
        displayCurrency: 'USD',      // we display USD for these three
        chargeCurrency: 'USD',
        prices: USD_TIERS.tier_high,
    },
    au: {
        displayCurrency: 'USD',
        chargeCurrency: 'USD',
        prices: USD_TIERS.tier_high,
    },
    nz: {
        displayCurrency: 'USD',
        chargeCurrency: 'USD',
        prices: USD_TIERS.tier_high,
    },

    // --- Asia (mid-tier) — display & charge USD ---
    ...Object.fromEntries(
        ['in', 'pk', 'bd', 'ph', 'vn', 'id', 'th', 'my', 'lk'].map((code) => [code, {
            displayCurrency: 'USD',
            chargeCurrency: 'USD',
            prices: USD_TIERS.tier_mid,
        }])
    ),

    // --- South America — display & charge USD ---
    ...Object.fromEntries(
        ['br', 'co', 'ar', 'pe', 'cl', 'ec'].map((code) => [code, {
            displayCurrency: 'USD',
            chargeCurrency: 'USD',
            prices: USD_TIERS.tier_mid,
        }])
    ),

    // --- High-income "rest of world" — display & charge USD ---
    ...Object.fromEntries(
        ['jp', 'kr', 'sg', 'ae', 'sa', 'il', 'tw', 'hk'].map((code) => [code, {
            displayCurrency: 'USD',
            chargeCurrency: 'USD',
            prices: USD_TIERS.tier_high,
        }])
    ),
};

const DEFAULT_PRICING = {
    displayCurrency: 'USD',
    chargeCurrency: 'USD',
    prices: USD_TIERS.tier_mid,
};

const BILLING_CYCLES = ['weekly', 'monthly', 'quarterly', 'semiannual', 'annual'];

function getPricingForCountry(countryCode) {
    const code = (countryCode || '').toLowerCase();
    return PRICING[code] || DEFAULT_PRICING;
}

/**
 * Resolve what the user sees (display) and what Paystack is asked to charge.
 * For unsupported display currencies, we fall back to USD using usdPrices.
 * The user is never charged more than their local price.
 */
function resolveChargeAmount(region, billingCycle) {
    const displayCurrency = region.displayCurrency;
    const chargeCurrency = region.chargeCurrency;
    const localAmount = region.prices[billingCycle];

    // Paystack-native path: localAmount is already the charge amount
    if (PAYSTACK_SUPPORTED.has(chargeCurrency)) {
        return {
            chargeAmount: localAmount,
            chargeCurrency,
        };
    }

    // Foreign path: charge in USD, using the region's usdPrices table.
    // If usdPrices is missing (shouldn't happen for foreign regions),
    // fall back to the raw local amount — but that would be wrong, so
    // guard loudly during development.
    const usdAmount = region.usdPrices?.[billingCycle];
    if (usdAmount == null) {
        throw new Error(
            `Missing usdPrices for ${displayCurrency}/${billingCycle}. ` +
            `Every non-Paystack region must define usdPrices.`
        );
    }

    return {
        chargeAmount: usdAmount,   // already rounded DOWN at definition time
        chargeCurrency: 'USD',
    };
}

module.exports = {
    PRICING,
    DEFAULT_PRICING,
    BILLING_CYCLES,
    PAYSTACK_SUPPORTED,
    getPricingForCountry,
    resolveChargeAmount,
};