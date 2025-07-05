const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Register User (sin cambios)
exports.register = async (req, res) => {
    const { nombre_usuario, correo_electronico, password, rol } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const [result] = await pool.execute(
            `INSERT INTO Usuarios (nombre_usuario, correo_electronico, password, rol) VALUES (?, ?, ?, ?)`,
            [nombre_usuario, correo_electronico, hashedPassword, rol]
        );
        res.status(201).json({ message: 'Usuario registrado exitosamente.', userId: result.insertId });
    } catch (error) {
        console.error(error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'El usuario o email ya existe.' });
        }
        res.status(500).json({ message: 'Error al registrar usuario.' });
    }
};

// Login User
exports.login = async (req, res) => {
    const { username, password } = req.body; // Ahora esperamos un campo 'identificador'

    const identificador = username;
    // --- AÑADIR ESTOS console.log PARA DEPURAR ---
    console.log('Login Request Body:', req.body);
    console.log('Identificador recibido (correo o usuario):', identificador);
    // --- FIN console.log ---

    // --- AÑADIR VALIDACIÓN PARA EVITAR UNDEFINED ---
    if (!identificador) {
        console.warn('Login Error: Identificador (correo o nombre de usuario) no proporcionado.');
        return res.status(400).json({ message: 'El correo electrónico o nombre de usuario es requerido.' });
    }
    // --- FIN VALIDACIÓN ---

    try {
        // La consulta SQL ahora busca por correo_electronico O nombre_usuario
        const [rows] = await pool.execute(
            `SELECT id, nombre_usuario, correo_electronico, password, rol FROM Usuarios WHERE correo_electronico = ? OR nombre_usuario = ?`,
            [identificador, identificador] // Pasamos el identificador dos veces
        );
        const user = rows[0];

        if (!user) {
            return res.status(400).json({ message: 'Credenciales inválidas.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Credenciales inválidas.' });
        }

        const token = jwt.sign(
            { id: user.id, rol: user.rol },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(200).json({
            message: 'Login exitoso.',
            token,
            user: {
                id: user.id,
                nombre_usuario: user.nombre_usuario,
                correo_electronico: user.correo_electronico,
                rol: user.rol
            }
        });
    } catch (error) {
        console.error('Error al intentar login:', error);
        res.status(500).json({ message: 'Error en el servidor.' });
    }
};