const { Sequelize, DataTypes } = require('sequelize');
const { postgresSequelize } = require('../database/postgresql');

const VerificationPicture = postgresSequelize.define('VerificationPicture',
    {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        user_id: { type: DataTypes.UUID, references: { model: 'Users', key: 'id' } },
        path: { type: DataTypes.STRING, allowNull: false },
    },
);

module.exports = VerificationPicture;