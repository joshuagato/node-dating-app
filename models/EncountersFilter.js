const { DataTypes } = require('sequelize');
const { postgresSequelize } = require('../database/postgresql');
const { GENDER } = require('../utils/constants');

const EncountersFilter = postgresSequelize.define('EncountersFilter', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        onDelete: 'CASCADE',
        references: { model: 'Users', key: 'id' },
    },
    max_distance_km: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 200,
        validate: { min: 1, max: 500 },
    },
    interested_in: {
        type: DataTypes.ENUM,
        allowNull: false,
        values: Object.values(GENDER),
        defaultValue: GENDER.EVERYONE,
    },
    min_age: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 18,
        validate: { min: 18, max: 100 },
    },
    max_age: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 100,
        validate: { min: 18, max: 100 },
    },
    online_only: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
    premium_only: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
    },
});

module.exports = EncountersFilter;