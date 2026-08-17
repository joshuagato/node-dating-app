const { Sequelize, DataTypes } = require('sequelize');
const { postgresSequelize } = require('../database/postgresql');
const { CHAT_PARTICIPANT_STATUS, CHAT_STARTER } = require('../utils/constants');

const Chat = postgresSequelize.define('Chat',
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
        // status: {
        //     type: DataTypes.ENUM, allowNull: false, values: Object.values(CHAT_PARTICIPANT_STATUS),
        //     defaultValue: CHAT_PARTICIPANT_STATUS.ACTIVE
        // },
        last_message_id: {
            type: DataTypes.UUID, allowNull: true, references: { model: 'Messages', key: 'id' }
        },
        starter_type: {
            type: DataTypes.ENUM, allowNull: false, values: Object.values(CHAT_STARTER),
            defaultValue: CHAT_STARTER.MATCH
        },
    },
);

module.exports = Chat;