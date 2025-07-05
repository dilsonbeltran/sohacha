const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');
require('dotenv').config();

// Routes
const authRoutes = require('./routes/authRoutes'); // You'll create this for user login/registration
const solicitudRoutes = require('./routes/solicitudRoutes');

const app = express();

// Connect to Database
connectDB();

// Middleware
app.use(cors()); // Allow cross-origin requests from frontend
app.use(express.json()); // Enable parsing of JSON body

// Mount Routes
app.use('/api/auth', authRoutes); // e.g., /api/auth/login, /api/auth/register
app.use('/api/solicitudes', solicitudRoutes); // e.g., /api/solicitudes, /api/solicitudes/:id

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));
