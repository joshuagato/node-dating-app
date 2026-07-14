const { DataTypes } = require('sequelize');
const { postgresSequelize } = require('../database/postgresql');

const PasswordResetRequest = postgresSequelize.define('PasswordResetRequest',
    {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        user_id: { type: DataTypes.UUID, references: { model: 'Users', key: 'id' } },
        password_reset_code: { type: DataTypes.STRING(6), defaultValue: null },
        password_reset_code_expiration: { type: DataTypes.DATE, defaultValue: null },
    },
    {
        updatedAt: false
    },
);

module.exports = PasswordResetRequest;