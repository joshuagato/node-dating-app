const { Sequelize, DataTypes } = require('sequelize');
const { postgresSequelize } = require('../database/postgresql');

const UserProfile = postgresSequelize.define('UserProfile', 
    {
        id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
        user_id: { type: DataTypes.UUID, references: { model: 'Users', key: 'id' } },
        first_name_on: { type: DataTypes.BOOLEAN, defaultValue: true },
        last_name_on: { type: DataTypes.BOOLEAN },
        other_names_on: { type: DataTypes.BOOLEAN, defaultValue: false },
        gender_on: { type: DataTypes.BOOLEAN },
    },
);

module.exports = UserProfile;