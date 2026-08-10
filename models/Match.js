const { Sequelize, DataTypes } = require('sequelize');
const { postgresSequelize } = require('../database/postgresql');
const { MATCH_STATUS } = require('../utils/constants');

const Match = postgresSequelize.define('Match',
    {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        initiator_id: {
            type: DataTypes.UUID, allowNull: false, onDelete: 'CASCADE',
            references: { model: 'Users', key: 'id' }
        },
        seconder_id: {
            type: DataTypes.UUID, allowNull: false, onDelete: 'CASCADE',
            references: { model: 'Users', key: 'id' }
        },
        status: {
            type: DataTypes.ENUM, allowNull: false, values: Object.values(MATCH_STATUS),
            defaultValue: MATCH_STATUS.ACTIVE
        },
    },
);

module.exports = Match;