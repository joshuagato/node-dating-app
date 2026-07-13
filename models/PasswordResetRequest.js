const { DataTypes } = require('sequelize');
const { postgresSequelize } = require('../database/postgresql');

const PasswordReset = postgresSequelize.define('PasswordReset',
    {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        user_id: { type: DataTypes.UUID, references: { model: 'Users', key: 'id' }, allowNull: true },
        password: { type: DataTypes.STRING, allowNull: false },
        password_reset_code: { type: DataTypes.STRING(6), defaultValue: null },
        password_reset_code_expiration: { type: DataTypes.DATE, defaultValue: null },
    },
    {
        updatedAt: false
    },
);

module.exports = PasswordReset;