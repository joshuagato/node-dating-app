const { DataTypes } = require('sequelize');
const { postgresSequelize } = require('../database/postgresql');

const UserDeviceToken = postgresSequelize.define('UserDeviceToken', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onDelete: 'CASCADE'
    },
    token: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    platform: {
        type: DataTypes.ENUM('web', 'android', 'ios'),
        allowNull: false
    }
}, {
    tableName: 'UserDeviceTokens',
    timestamps: true,
    indexes: [
        { unique: true, fields: ['user_id', 'token'] }
    ]
});

module.exports = UserDeviceToken;