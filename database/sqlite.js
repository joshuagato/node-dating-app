const { Sequelize } = require('sequelize');
const { color, log } = require('console-log-colors');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite'
});

const connectSqlite = async () => {
    try {
        await sequelize.authenticate();
        log.green('Connection to Sqlite successful.');
    } catch (error) {
        console.error(color.red('Unable to connect to Sqlite database:', error));
    }
}

module.exports = connectSqlite;