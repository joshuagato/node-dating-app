const { Sequelize, DataTypes } = require('sequelize');
const { postgresSequelize } = require('../database/postgresql');

const UserPicture = postgresSequelize.define('UserPicture',
    {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        user_id: { type: DataTypes.UUID, references: { model: 'Users', key: 'id' } },
        path: { type: DataTypes.STRING, allowNull: false },
        position: { type: DataTypes.INTEGER, allowNull: false },
    },
);

module.exports = UserPicture;