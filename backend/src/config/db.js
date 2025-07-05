const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'Dabt2011203**',
    database: process.env.DB_NAME || 'iyv_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function connectDB() {
    try {
        await pool.getConnection();
        console.log('Conexión exitosa a la base de datos MySQL.');
    } catch (error) {
        console.error('Error al conectar a la base de datos:', error.message);
        process.exit(1); // Exit process with failure
    }
}

module.exports = { pool, connectDB };
