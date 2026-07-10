const { DataTypes } = require('sequelize');
const { postgresSequelize } = require('../database/postgresql');

const { VERIFICATION_CHANNEL } = require('../utils/constants');

const PasswordResetAttempt = postgresSequelize.define('PasswordResetAttempt',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    user_id: { type: DataTypes.UUID, references: { model: 'Users', key: 'id' }, allowNull: true },
    verification_code: { type: DataTypes.STRING, defaultValue: null },
    verification_code_correct: { type: DataTypes.BOOLEAN, defaultValue: false },
    device: { type: DataTypes.STRING, defaultValue: null },
  },
  {
    updatedAt: false
  },
);

module.exports = PasswordResetAttempt;