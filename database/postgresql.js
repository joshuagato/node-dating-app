const { Sequelize } = require('sequelize');
const { color, log } = require('console-log-colors');

const db_host = process.env.DB_HOST;
const db_name = process.env.DB_NAME;
const db_username = process.env.DB_USERNAME;
const db_password = process.env.DB_PASSWORD;

const postgresSequelize = new Sequelize(db_name, db_username, db_password, {
    host: db_host,
    dialect: 'postgres'
});

const connectPostgreSql = async () => {
    try {
        await postgresSequelize.authenticate();
        log.green('Connection to PostgreSql successful.');
    } catch (error) {
        console.error(color.red('Unable to connect to PostgreSql database:', error));
    }
}

(async () => {
    //   await postgresSequelize.sync({ force: true });
    await postgresSequelize.sync({ alter: true });
    //   await postgresSequelize.sync();
})();

exports.connectPostgreSql = connectPostgreSql;
exports.postgresSequelize = postgresSequelize;
