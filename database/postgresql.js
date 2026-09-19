const { Sequelize } = require('sequelize');
const { color, log } = require('console-log-colors');

const db_host = process.env.DB_HOST;
const db_name = process.env.DB_NAME;
const db_username = process.env.DB_USERNAME;
const db_password = process.env.DB_PASSWORD;
const db_port = process.env.DB_PORT

const postgresSequelize = new Sequelize(db_name, db_username, db_password, {
    host: db_host,
    port: Number(db_port),
    dialect: 'postgres',
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false // Prevents self-signed SSL errors from hosted PostgreSQL
        }
    },
    logging: false, // set to console.log while debugging
    pool: {
        max: 5,        // Supabase free tier caps connections; keep this small
        min: 0,
        acquire: 30000,
        idle: 10000,
    },
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
