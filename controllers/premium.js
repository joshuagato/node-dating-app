const crypto = require('crypto');
const axios = require('axios');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const { BILLING_CYCLES, getPricingForCountry, computeGhsCharge } = require('../config/pricing');

User.hasMany(Subscription, { foreignKey: 'user_id', as: 'subscriptions' });

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_API = 'https://api.paystack.co';

const DURATION_DAYS = {
    weekly: 7,
    monthly: 30,
    quarterly: 90,
    semiannual: 180,
    annual: 365,
};

// ---------------------------------------------------------------------------
// GET /api/premium/prices
// ---------------------------------------------------------------------------
exports.getPrices = async (req, res) => {
    try {
        const user = req.user;
        if (!user) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        const region = getPricingForCountry(user.country_code);
        const displayCurrency = region.displayCurrency;

        // Build a `charges` map so the frontend can show the GHS amount
        // for whichever cycle the user selects, without recomputing.
        const charges = {};
        for (const cycle of BILLING_CYCLES) {
            charges[cycle] = computeGhsCharge(region, cycle);
        }

        return res.json({
            success: true,
            email: user.email,
            displayCurrency,
            prices: region.prices,
            charges,
            // Useful for the "1 USD ≈ X GHS" note if you ever want to show it.
            usdToGhs: 11.62,
        });
    } catch (error) {
        console.error('Failed to get premium prices:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to load pricing',
            error: error.message,
        });
    }
};

// ---------------------------------------------------------------------------
// POST /api/premium/paystack/verify
// Called by the frontend immediately after Paystack popup onSuccess.
// ---------------------------------------------------------------------------
exports.verifyPaystackPayment = async (req, res) => {
    try {
        const { reference } = req.body;
        if (!reference) {
            return res.status(400).json({ success: false, message: 'Reference required.' });
        }

        // 1. Verify with Paystack
        const { data } = await axios.get(
            `${PAYSTACK_API}/transaction/verify/${reference}`,
            { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
        );

        if (!data.status || data.data.status !== 'success') {
            return res.status(400).json({ success: false, message: 'Payment not successful.' });
        }

        const tx = data.data;

        // 2. Trust the session for identity, not the client payload
        const user_id = req.user.id;

        const { billing_cycle } = tx.metadata || {};
        if (!billing_cycle) {
            return res.status(400).json({ success: false, message: 'Missing billing cycle.' });
        }

        // 3. Sanity-check the amount against what this user's region should pay
        const region = getPricingForCountry(req.user.country_code);
        const { chargeAmount, chargeCurrency } = computeGhsCharge(region, billing_cycle);

        if (tx.amount !== chargeAmount || tx.currency !== chargeCurrency) {
            console.warn('Amount mismatch:', {
                expected: { amount: chargeAmount, currency: chargeCurrency },
                received: { amount: tx.amount, currency: tx.currency },
                reference,
            });
            return res.status(400).json({ success: false, message: 'Amount mismatch.' });
        }

        // 4. Grant entitlement + record subscription
        const { subscription, alreadyRecorded } = await grantPremium({
            userId: user_id,
            billingCycle: billing_cycle,
            reference: tx.reference,
            chargeAmount: tx.amount,
            chargeCurrency: tx.currency,
            rawPayload: tx,
        });

        return res.json({
            success: true,
            alreadyRecorded,
            subscriptionId: subscription?.id || null,
            message: 'Premium activated.',
        });
    } catch (error) {
        console.error('verifyPaystackPayment error:', error.response?.data || error.message);
        return res.status(500).json({ success: false, error: 'Verification failed.' });
    }
};

// ---------------------------------------------------------------------------
// POST /api/premium/paystack/webhook
// Paystack → your server. Signature-verified, idempotent.
// ---------------------------------------------------------------------------
exports.paystackWebhook = async (req, res) => {
    try {
        const signature = req.headers['x-paystack-signature'];
        const rawBody = req.rawBody;

        if (!rawBody) {
            console.warn('Webhook hit without raw body — check express.json verify hook');
            return res.status(400).send('Missing raw body');
        }

        const hash = crypto
            .createHmac('sha512', PAYSTACK_SECRET)
            .update(rawBody)                 // Buffer, not JSON.stringify(req.body)
            .digest('hex');

        if (hash !== signature) {
            console.warn('Invalid Paystack webhook signature');
            return res.status(401).send('Unauthorized');
        }

        const event = req.body;              // parsed JSON is fine from here on

        if (event.event === 'charge.success') {
            const tx = event.data;
            const { user_id, billing_cycle } = tx.metadata || {};

            if (user_id && billing_cycle) {
                try {
                    await grantPremium({
                        userId: user_id,
                        billingCycle: billing_cycle,
                        reference: tx.reference,
                        chargeAmount: tx.amount,
                        chargeCurrency: tx.currency,
                        rawPayload: tx,
                    });
                } catch (err) {
                    console.error('Webhook grantPremium failed:', err);
                }
            }
        }

        return res.status(200).send('OK');
    } catch (error) {
        console.error('paystackWebhook error:', error);
        return res.status(200).send('OK');
    }
};

// ---------------------------------------------------------------------------
// Helper: grant premium + record subscription
// ---------------------------------------------------------------------------
async function grantPremium({
    userId,
    billingCycle,
    reference,
    chargeAmount,
    chargeCurrency,
    rawPayload,
}) {
    // 1. Guard against an invalid cycle
    const durationDays = DURATION_DAYS[billingCycle];
    if (!durationDays) {
        console.warn(`grantPremium: invalid billing cycle "${billingCycle}" for user ${userId}`);
        return { subscription: null, alreadyRecorded: false };
    }

    // 2. Idempotency — has this reference already been recorded?
    if (reference) {
        const existing = await Subscription.findOne({
            where: { paystack_reference: reference },
        });
        if (existing) {
            return { subscription: existing, alreadyRecorded: true };
        }
    }

    // 3. Load user
    const user = await User.findByPk(userId);
    if (!user) {
        console.warn(`grantPremium: user ${userId} not found`);
        return { subscription: null, alreadyRecorded: false };
    }

    // 4. Snapshot display amounts from the region config
    const region = getPricingForCountry(user.country_code);
    const displayAmount = region.prices[billingCycle];
    const displayCurrency = region.displayCurrency;

    // 5. USD equivalent (major units) for cross-region analytics
    let usdEquivalent = null;
    if (chargeCurrency === 'USD') {
        usdEquivalent = (chargeAmount / 100).toFixed(2);
    } else if (region.usdPrices?.[billingCycle] != null) {
        usdEquivalent = (region.usdPrices[billingCycle] / 100).toFixed(2);
    }

    // 6. Compute entitlement window
    const now = new Date();
    const base =
        user.premium_expires_at && new Date(user.premium_expires_at) > now
            ? new Date(user.premium_expires_at)
            : now;
    const expiresAt = new Date(base.getTime() + durationDays * 24 * 60 * 60 * 1000);

    // 7. First purchase flag
    const priorCount = await Subscription.count({ where: { user_id: userId } });
    const isFirstPurchase = priorCount === 0;

    // 8. Insert subscription row (unique constraint protects against races)
    let subscription;
    try {
        subscription = await Subscription.create({
            user_id: userId,
            billing_cycle: billingCycle,

            display_amount: displayAmount,
            display_currency: displayCurrency,
            charge_amount: chargeAmount,
            charge_currency: chargeCurrency,
            usd_equivalent: usdEquivalent,

            payment_provider: 'paystack',
            paystack_reference: reference || null,
            paystack_channel: rawPayload?.channel || null,

            starts_at: base,
            expires_at: expiresAt,
            duration_days: durationDays,

            status: 'active',
            country_code: user.country_code ? user.country_code.toLowerCase() : null,
            is_first_purchase: isFirstPurchase,

            gateway_payload: rawPayload || null,
        });
    } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
            const existing = await Subscription.findOne({
                where: { paystack_reference: reference },
            });
            return { subscription: existing, alreadyRecorded: true };
        }
        throw err;
    }

    // 9. Update user's entitlement
    await user.update({
        is_premium: true,
        premium_expires_at: expiresAt,
        premium_cycle: billingCycle,
    });

    return { subscription, alreadyRecorded: false };
}