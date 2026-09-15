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

        // Setup Phase Fields
        bio: { type: DataTypes.TEXT, allowNull: true },
        reason_on_app: { type: DataTypes.STRING, allowNull: true },
        education: { type: DataTypes.STRING, allowNull: true },
        relationship_status: { type: DataTypes.STRING, defaultValue: 'Single' },
        height_cm: { type: DataTypes.INTEGER, allowNull: true },
        smoking: { type: DataTypes.STRING, defaultValue: 'Never' },
        drinking: { type: DataTypes.STRING, defaultValue: 'Socially' }
    },
    {
        tableName: 'UserProfiles'
    }
);

module.exports = UserProfile;