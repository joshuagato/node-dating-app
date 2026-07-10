const { DataTypes } = require('sequelize');
const { postgresSequelize } = require('../database/postgresql');

const { VERIFICATION_CHANNEL } = require('../utils/constants');

const EmailVerificationAttempts = postgresSequelize.define('EmailVerificationAttempts',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    user_id: { type: DataTypes.UUID, references: { model: 'Users', key: 'id' } },
    verification_code: { type: DataTypes.STRING, defaultValue: null },
    verification_code_correct: { type: DataTypes.BOOLEAN, defaultValue: false },
    verification_code_expired: { type: DataTypes.BOOLEAN, defaultValue: false },
    verification_channel: { type: DataTypes.ENUM, values: [VERIFICATION_CHANNEL.LOGIN, VERIFICATION_CHANNEL.SIGNUP] },
  },
  {
    updatedAt: false
  },
);

module.exports = EmailVerificationAttempts;