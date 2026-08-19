const { Sequelize, DataTypes } = require('sequelize');
const { postgresSequelize } = require('../database/postgresql');
const { MESSAGE_TYPE, MESSAGE_STATUS, MESSAGE_DIRECTION, CALL_TYPE } = require('../utils/constants');

const Message = postgresSequelize.define('Message',
    {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        match_id: {
            type: DataTypes.UUID, allowNull: false, onDelete: 'CASCADE', references: { model: 'Matches', key: 'id' }
        },
        chat_id: {
            type: DataTypes.UUID, allowNull: false, onDelete: 'CASCADE', references: { model: 'Chats', key: 'id' }
        },
        sender_id: {
            type: DataTypes.UUID, allowNull: false, onDelete: 'CASCADE', references: { model: 'Users', key: 'id' }
        },
        recipient_id: {
            type: DataTypes.UUID, allowNull: false, onDelete: 'CASCADE', references: { model: 'Users', key: 'id' }
        },
        content: { type: DataTypes.TEXT, allowNull: true },
        message_type: { type: DataTypes.ENUM, values: Object.values(MESSAGE_TYPE), defaultValue: MESSAGE_TYPE.TEXT },
        // status: {
        //     type: DataTypes.ENUM, allowNull: false, values: Object.values(MESSAGE_STATUS), defaultValue: MESSAGE_STATUS.SENT
        // },
        // direction: { type: DataTypes.ENUM, values: Object.values(MESSAGE_DIRECTION) },
        reply_to_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'Messages', key: 'id' } },
        // forwarded_from_id: {
        //     type: DataTypes.UUID, allowNull: true, references: { model: 'Messages', key: 'id' }
        // },
        sent_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
        delivered_at: { type: DataTypes.DATE, allowNull: true },
        read_at: { type: DataTypes.DATE, allowNull: true },
        // attachments: { type: DataTypes.JSONB, defaultValue: [], allowNull: true },
        // metadata: { type: DataTypes.JSONB, defaultValue: {}, allowNull: true },
        call_duration: { type: DataTypes.INTEGER, allowNull: true },
        call_type: { type: DataTypes.ENUM, values: Object.values(CALL_TYPE), allowNull: true },
        // poll_data: { type: DataTypes.JSONB, allowNull: true },
        // location: { type: DataTypes.JSONB, allowNull: true },
        reactions: { type: DataTypes.JSONB, defaultValue: {}, allowNull: true },
        is_deleted: { type: DataTypes.BOOLEAN, defaultValue: false },
        deleted_for: { type: DataTypes.ARRAY(DataTypes.UUID), defaultValue: [] },
        is_important: { type: DataTypes.BOOLEAN, defaultValue: false },
        edited_at: { type: DataTypes.DATE, allowNull: true },
        edit_count: { type: DataTypes.INTEGER, defaultValue: 0 }
    },
);

module.exports = Message;