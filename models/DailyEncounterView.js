const { Sequelize, DataTypes } = require('sequelize');
const { postgresSequelize } = require('../database/postgresql');

const DailyEncounterView = postgresSequelize.define('DailyEncounterView',
    {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        user_id: { type: DataTypes.UUID, allowNull: false, unique: true },
        count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        window_started_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
);

module.exports = DailyEncounterView;