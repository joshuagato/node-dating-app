const { DataTypes } = require('sequelize');
const { postgresSequelize } = require('../database/postgresql');

const PasswordResetVerificationAttempt = postgresSequelize.define('PasswordResetVerificationAttempt',
    {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        user_id: { type: DataTypes.UUID, references: { model: 'Users', key: 'id' }, allowNull: false },
        password_reset_request_id: { type: DataTypes.UUID, references: { model: 'PasswordResetRequests', key: 'id' }, allowNull: false },
        verification_code_entered: { type: DataTypes.STRING, defaultValue: null },
        verification_code_correct: { type: DataTypes.BOOLEAN, allowNull: true },
        verification_code_expired: { type: DataTypes.BOOLEAN, defaultValue: false },
    },
    {
        updatedAt: false
    },
);

module.exports = PasswordResetVerificationAttempt;