const { DataTypes } = require('sequelize');
const { postgresSequelize } = require('../database/postgresql');

const EmailVerificationRequest = postgresSequelize.define('EmailVerificationRequest',
    {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        user_id: { type: DataTypes.UUID, references: { model: 'Users', key: 'id' }, allowNull: true },
        email_verification_code: { type: DataTypes.STRING(4), defaultValue: null },
        email_verification_code_expiration: { type: DataTypes.DATE, defaultValue: null },
    },
    {
        updatedAt: false
    },
);

module.exports = EmailVerificationRequest;