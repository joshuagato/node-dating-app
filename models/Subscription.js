const { DataTypes } = require('sequelize');
const { postgresSequelize } = require('../database/postgresql');

const Subscription = postgresSequelize.define('Subscription', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onDelete: 'CASCADE',
    },

    // --- Plan identity ---
    billing_cycle: {
        type: DataTypes.ENUM('weekly', 'monthly', 'quarterly', 'semiannual', 'annual'),
        allowNull: false,
    },

    // --- Money ---
    // display_amount / display_currency: what the user saw on screen
    // charge_amount  / charge_currency : what Paystack actually processed (smallest unit)
    display_amount: { type: DataTypes.INTEGER, allowNull: false },
    display_currency: { type: DataTypes.STRING(3), allowNull: false },
    charge_amount: { type: DataTypes.INTEGER, allowNull: false },
    charge_currency: { type: DataTypes.STRING(3), allowNull: false },

    // USD-normalised value at purchase time — useful for cross-region
    // revenue analytics without needing to re-apply exchange rates later.
    usd_equivalent: { type: DataTypes.DECIMAL(10, 2), allowNull: true },

    // --- Payment gateway ---
    payment_provider: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'paystack' },
    paystack_reference: { type: DataTypes.STRING(120), allowNull: true, unique: true },
    paystack_channel: { type: DataTypes.STRING(40), allowNull: true }, // 'card' | 'mobile_money' | ...

    // --- Entitlement window (what this purchase granted) ---
    starts_at: { type: DataTypes.DATE, allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    duration_days: { type: DataTypes.INTEGER, allowNull: false },

    // --- Status ---
    status: {
        type: DataTypes.ENUM('active', 'expired', 'refunded', 'cancelled'),
        allowNull: false,
        defaultValue: 'active',
    },
    refunded_at: { type: DataTypes.DATE, allowNull: true },
    refund_reason: { type: DataTypes.STRING(255), allowNull: true },

    // --- Context ---
    country_code: { type: DataTypes.STRING(2), allowNull: true }, // snapshot, not FK
    is_first_purchase: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    // --- Raw payloads for debugging / audit ---
    // Store the full Paystack verify response so you can re-derive
    // anything you didn't model explicitly.
    gateway_payload: { type: DataTypes.JSONB, allowNull: true },
}, {
    tableName: 'Subscriptions',
    indexes: [
        { fields: ['user_id'] },
        { fields: ['status'] },
        { fields: ['billing_cycle'] },
        { fields: ['createdAt'] },
        { fields: ['country_code'] },
        // Composite for the common "who is currently subscribed" query
        { fields: ['user_id', 'status'] },
    ],
});

Subscription.associate = (models) => {
    Subscription.belongsTo(models.User, {
        foreignKey: 'user_id',
        as: 'user',
    });
};

module.exports = Subscription;