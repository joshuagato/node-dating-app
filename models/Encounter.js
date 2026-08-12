const { Sequelize, DataTypes } = require('sequelize');
const { postgresSequelize } = require('../database/postgresql');
const { ENCOUNTER_ACTION } = require('../utils/constants');

const Encounter = postgresSequelize.define('Encounter',
    {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        initiator_id: {
            type: DataTypes.UUID, allowNull: false, onDelete: 'CASCADE',
            references: { model: 'Users', key: 'id' }
        },
        recipient_id: {
            type: DataTypes.UUID, allowNull: false, onDelete: 'CASCADE',
            references: { model: 'Users', key: 'id' }
        },
        action: { type: DataTypes.ENUM, allowNull: false, values: Object.values(ENCOUNTER_ACTION) },
        seen_in_users_who_like_me: { type: DataTypes.BOOLEAN, defaultValue: false },
        seen_in_users_who_like_me_at: { type: DataTypes.DATE, allowNull: true },
        seen_in_users_who_dislike_me: { type: DataTypes.BOOLEAN, defaultValue: false },
        seen_in_users_who_dislike_me_at: { type: DataTypes.DATE, allowNull: true },
        seen_in_users_disliked_by_me: { type: DataTypes.BOOLEAN, defaultValue: false },
        seen_in_users_disliked_by_me_at: { type: DataTypes.DATE, allowNull: true },
    },
);

module.exports = Encounter;