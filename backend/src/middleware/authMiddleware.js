const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

exports.authenticate = async (req, res, next) => {
    console.log('--- Entering authenticate middleware ---');
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.warn('AUTH_FAIL: No Bearer token provided in Authorization header.');
        return res.status(401).json({ message: 'No authentication token provided.' });
    }

    const token = authHeader.split(' ')[1];
    console.log('AUTH_INFO: Token received:', token ? token.substring(0, 10) + '...' : 'none');

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        console.log('AUTH_INFO: Token decoded successfully. Decoded ID:', decoded.id); // decoded.id es el ID numérico

        // Fetch user details from DB using the numeric ID
        const [rows] = await pool.execute('SELECT id, rol, nombre_usuario FROM Usuarios WHERE id = ?', [decoded.id]);

        if (rows.length === 0) {
            console.warn('AUTH_FAIL: User not found in DB for decoded ID:', decoded.id);
            return res.status(401).json({ message: 'User not found.' });
        }

        req.user = {
            id: rows[0].id, // Usar el nuevo ID numérico
            rol: rows[0].rol,
            nombre_usuario: rows[0].nombre_usuario
        };
        console.log('AUTH_SUCCESS: req.user populated:', req.user);
        next();

    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            console.error('AUTH_ERROR: Token expired for request:', req.originalUrl);
            return res.status(401).json({ message: 'Authentication failed: Token expired.' });
        }
        if (error.name === 'JsonWebTokenError') {
            console.error('AUTH_ERROR: Invalid token for request:', req.originalUrl, 'Error:', error.message);
            return res.status(401).json({ message: 'Authentication failed: Invalid token.' });
        }
        console.error('AUTH_ERROR: Unexpected error during token verification for request:', req.originalUrl, error);
        res.status(500).json({ message: 'Internal server error during authentication.' });
    }
    console.log('--- Exiting authenticate middleware (via catch or next) ---');
};

exports.authorize = (allowedRoles) => {
    return (req, res, next) => {
        console.log('--- Entering authorize middleware ---');
        console.log('AUTHZ_INFO: req.user (from authenticate):', req.user);
        console.log('AUTHZ_INFO: allowedRoles for this route:', allowedRoles);

        if (!req.user || !req.user.rol) {
            console.warn('AUTHZ_FAIL: req.user or req.user.rol is undefined. This should not happen if authenticate was successful.');
            return res.status(403).json({ message: 'Acceso denegado: Usuario no autenticado o rol no definido (Problema de middleware).' });
        }

        if (!allowedRoles.includes(req.user.rol)) {
            console.warn(`AUTHZ_FAIL: User role "${req.user.rol}" not in allowed roles: [${allowedRoles.join(', ')}]`);
            return res.status(403).json({ message: 'Acceso denegado: Su rol no tiene permisos para esta acción.' });
        }

        console.log('AUTHZ_SUCCESS: User is authorized.');
        next();
    };
};