const express = require('express');
const router = express.Router();
const solicitudController = require('../controllers/solicitudController');
const { authenticate, authorize } = require('../middleware/authMiddleware');

// Aplicar middleware de autenticación y autorización a todas las rutas protegidas
router.post('/', authenticate, authorize(['IyV']), solicitudController.createSolicitud);

router.put('/:id/process-event', authenticate, authorize(['IyV', 'Administrador', 'Area_Calidad', 'Area_Planeacion', 'Area_Financiero']), solicitudController.handleProcessEvent);

router.get('/', authenticate, authorize(['IyV', 'Administrador', 'Area_Calidad', 'Area_Planeacion', 'Area_Financiero']), solicitudController.getAllSolicitudes);
router.get('/:id', authenticate, authorize(['IyV', 'Administrador', 'Area_Calidad', 'Area_Planeacion', 'Area_Financiero']), solicitudController.getSolicitudById);

router.delete('/:id', authenticate, authorize(['Administrador']), solicitudController.deleteSolicitud);

module.exports = router;