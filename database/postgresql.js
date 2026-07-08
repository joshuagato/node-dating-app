const { Sequelize } = require('sequelize');
const { color, log } = require('console-log-colors');

const postgresSequelize = new Sequelize('dating', 'postgres', 'postgres', {
  host: 'localhost',
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
