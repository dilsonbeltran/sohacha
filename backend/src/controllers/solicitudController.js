const { pool } = require('../config/db');
const dayjs = require('dayjs');
const { calculateDeadline } = require('../utils/helpers');

const { PROCESS_EVENTS, getProcessEventByName, ROLES } = require('../config/processEvents');

const ALLOWED_SOLICITUD_TYPES = [
    "LICENCIA DE FUNCIONAMIENTO EPBM", "LICENCIA DE FUNCIONAMIENTO ETDH", "LICENCIA Y REGISTRO DE PROGRAMAS ETDH",
    "AMPLIACIÓN DE OFERTA EDUCATIVA", "DISMINUCIÓN DE OFERTA EDUCATIVA", "CAMBIO DE SEDE", "NUEVA SEDE",
    "CAMBIO DE REPRESENTANTE LEGAL", "CAMBIO DE NOMENCLATURA", "LICENCIA DE FUNCIONAMIENTO EPJA",
    "SUBSANACIÓN LICENCIA CONDICIONAL", "SOLICITUD AMPLIACIÓN LICENCIA CONDICIONAL"
];

// La lógica para 'checkAllApprovalsComplete' probablemente ya no sea necesaria o cambiará.
// Ahora, la idea es que las áreas simplemente digan si "Aplica" o "No Aplica" a su aprobación.
// El estado general de la solicitud manejará si está "Aprobada" o "Rechazada".
// Si aún necesitas una validación de "todas las aprobaciones aplicables completadas",
// tendrías que redefinir esta función para verificar si los campos tienen un valor distinto de NULL.
/*
const checkAllApprovalsComplete = (solicitud) => {
    // Ejemplo: Si todas las aprobaciones que 'Aplican' han sido marcadas
    // Esto es una simplificación y podría necesitar lógica más compleja
    // si 'aprobado' o 'no_aprobado' siguen existiendo en el flujo de eventos.
    return (solicitud.aprobacion_calidad === 'Aplica' || solicitud.aprobacion_calidad === 'No Aplica' || solicitud.aprobacion_calidad === null) &&
           (solicitud.aprobacion_planeacion === 'Aplica' || solicitud.aprobacion_planeacion === 'No Aplica' || solicitud.aprobacion_planeacion === null) &&
           (solicitud.aprobacion_financiero === 'Aplica' || solicitud.aprobacion_financiero === 'No Aplica' || solicitud.aprobacion_financiero === null) &&
           (solicitud.aprobacion_iyv === 'Aplica' || solicitud.aprobacion_iyv === 'No Aplica' || solicitud.aprobacion_iyv === null);
};
*/


exports.createSolicitud = async (req, res) => {
    const {
        solicitante,
        radicado,
        fecha_radicacion,
        tipo_solicitud,
        correo_electronico_solicitante,
        comentario_inicial
    } = req.body;

    if (!ALLOWED_SOLICITUD_TYPES.includes(tipo_solicitud)) {
        return res.status(400).json({ message: 'Tipo de solicitud inválido.' });
    }

    const usuario_creacion_id = req.user.id;
    const fechaActual = dayjs().format('YYYY-MM-DD HH:mm:ss');
    const fechaLimiteProceso = calculateDeadline(fechaActual, 6); // 6 meses

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Insertar la nueva solicitud
        // Las columnas de aprobación se inicializan a NULL por defecto de la DB
        // o explícitamente a NULL aquí, ya que 'Aplica'/'No Aplica' se definirán después.
        const [solicitudResult] = await connection.execute(
            `INSERT INTO Solicitudes (
                solicitante, radicado, fecha_radicacion, tipo_solicitud,
                correo_electronico_solicitante, estado_actual, fecha_limite_proceso,
                aprobacion_calidad, aprobacion_planeacion, aprobacion_financiero, aprobacion_iyv, contador_visitas,
                usuario_creacion_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 0, ?)`, // Todos los campos de aprobación como NULL inicial
            [
                solicitante, radicado, fecha_radicacion, tipo_solicitud,
                correo_electronico_solicitante, "Recibido Inspección y Vigilancia", fechaLimiteProceso,
                usuario_creacion_id
            ]
        );
        const newSolicitudId = solicitudResult.insertId;

        // 2. Registrar el evento inicial
        const initialEvent = getProcessEventByName("recepcion_solicitud");
        await connection.execute(
            `INSERT INTO EventosProceso (
                solicitud_id, nombre_proceso, fecha_registro, usuario_responsable_id,
                estado_resultado, comentario_proceso, area_involucrada, documentos_adjuntos, fecha_proxima_accion
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                newSolicitudId,
                initialEvent.label, fechaActual, usuario_creacion_id,
                initialEvent.statusOptions[0], comentario_inicial, ROLES.IYV, null, null
            ]
        );

        await connection.commit();
        res.status(201).json({
            message: 'Solicitud creada exitosamente y evento inicial registrado.',
            solicitudId: newSolicitudId
        });

    } catch (error) {
        await connection.rollback();
        console.error('Error al crear la solicitud:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: 'El número de radicado ya existe.' });
        }
        res.status(500).json({ message: 'Error interno del servidor al crear la solicitud.' });
    } finally {
        connection.release();
    }
};


exports.getAllSolicitudes = async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT
                s.*,
                u.nombre_usuario as nombre_creador_usuario
            FROM Solicitudes s
            LEFT JOIN Usuarios u ON s.usuario_creacion_id = u.id
            ORDER BY s.fecha_radicacion DESC
        `);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Error al obtener solicitudes:', error);
        res.status(500).json({ message: 'Error interno del servidor al obtener solicitudes.' });
    }
};


exports.getSolicitudById = async (req, res) => {
    const { id } = req.params;
    try {
        const [solicitudRows] = await pool.execute(`
            SELECT
                s.*,
                u.nombre_usuario AS nombre_creador_usuario,
                u.correo_electronico AS correo_creador_usuario
            FROM Solicitudes s
            LEFT JOIN Usuarios u ON s.usuario_creacion_id = u.id
            WHERE s.id = ?
        `, [id]);

        if (solicitudRows.length === 0) {
            return res.status(404).json({ message: 'Solicitud no encontrada.' });
        }
        const solicitud = solicitudRows[0];

        const [eventosRows] = await pool.execute(`
            SELECT
                ep.*,
                u.nombre_usuario AS usuario_responsable_nombre
            FROM EventosProceso ep
            LEFT JOIN Usuarios u ON ep.usuario_responsable_id = u.id
            WHERE ep.solicitud_id = ?
            ORDER BY ep.fecha_registro ASC
        `, [id]);

        solicitud.historial_eventos = eventosRows;

        res.status(200).json(solicitud);
    } catch (error) {
        console.error('Error al obtener la solicitud por ID:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

exports.handleProcessEvent = async (req, res) => {
    const { id: solicitudId } = req.params;
    // Ahora recibiremos el valor de 'Aplica' o 'No Aplica' para el campo específico
    const { eventName, estado_resultado, comentario_proceso, documentos_adjuntos, areas_involucradas, fecha_visita, hora_visita, motivo_cierre, aprobacion_iyv_value } = req.body;
    const usuarioResponsableId = req.user.id;
    const usuarioResponsableRol = req.user.rol;
    const fechaRegistro = dayjs().format('YYYY-MM-DD HH:mm:ss');

    const eventConfig = getProcessEventByName(eventName);

    if (!eventConfig) {
        return res.status(400).json({ message: 'Tipo de evento de proceso no válido.' });
    }

    if (!eventConfig.allowedRoles.includes(usuarioResponsableRol)) {
        return res.status(403).json({ message: 'No tiene permisos para ejecutar este evento.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [solicitudRows] = await connection.execute(`SELECT * FROM Solicitudes WHERE id = ? FOR UPDATE`, [solicitudId]);
        if (solicitudRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Solicitud no encontrada.' });
        }
        const currentSolicitud = solicitudRows[0];

        if (eventConfig.previousState) {
            const allowedPreviousStates = Array.isArray(eventConfig.previousState)
                ? eventConfig.previousState
                : [eventConfig.previousState];

            if (!allowedPreviousStates.includes(currentSolicitud.estado_actual)) {
                await connection.rollback();
                return res.status(400).json({
                    message: `La solicitud no está en el estado correcto para el evento '${eventConfig.label}'. Estado actual: '${currentSolicitud.estado_actual}'. Se esperaba: '${allowedPreviousStates.join(', ')}'`
                });
            }
        }

        let newSolicitudState = currentSolicitud.estado_actual;
        let fechaProximaAccion = null;
        let updateSolicitudFields = {};

        // Lógica para actualizar los campos de aprobación individual:
        // Si el evento corresponde a una decisión sobre la aplicabilidad de una aprobación,
        // actualiza el campo correspondiente.
        if (eventName === "verificacion_documentos_iyv" && usuarioResponsableRol === ROLES.IYV) {
            // Este evento podría determinar si la aprobación de IYV 'Aplica' o 'No Aplica'.
            // El `aprobacion_iyv_value` debería venir en el `req.body`
            if (aprobacion_iyv_value === 'Aplica' || aprobacion_iyv_value === 'No Aplica') {
                updateSolicitudFields.aprobacion_iyv = aprobacion_iyv_value;
            } else {
                 // Si no se envía un valor válido, quizás no hacer nada o lanzar un error
                console.warn(`Valor no válido para aprobacion_iyv: ${aprobacion_iyv_value}`);
            }

            // Aquí también se decide el `estado_resultado` y `newSolicitudState`
            // Basado en el `estado_resultado` del evento, se determina el siguiente estado de la solicitud.
            if (estado_resultado === "Documentos OK - Para Radicación en Áreas") {
                newSolicitudState = "Verificación por Áreas"; // Nuevo estado si IYV valida documentos
            } else if (estado_resultado === "Subsanación de documentos IyV") {
                newSolicitudState = "Subsanación de documentos IYV";
                fechaProximaAccion = dayjs(fechaRegistro).add(getProcessEventByName("recepcion_subsanacion_iyv").vencimientoDias, 'day').format('YYYY-MM-DD HH:mm:ss');
            } else if (estado_resultado === "Cerrada No Exitosa") {
                newSolicitudState = "Cerrada No Exitosa";
                updateSolicitudFields.fecha_cierre = fechaRegistro;
                updateSolicitudFields.motivo_cierre = comentario_proceso;
            }
        }

        switch (eventName) {
            case "verificacion_documentos_iyv":
            case "recepcion_subsanacion_iyv":
            case "recepcion_subsanacion_area":
            case "acto_administrativo":
                // Lógica de transición de estados basada en `estado_resultado`
                if (!estado_resultado || !eventConfig.nextStates[estado_resultado]) {
                    await connection.rollback();
                    return res.status(400).json({ message: `Resultado del evento '${eventConfig.label}' no válido.` });
                }
                newSolicitudState = eventConfig.nextStates[estado_resultado];
                if (estado_resultado.includes("Subsanación") && eventConfig.vencimientoDias) {
                    fechaProximaAccion = dayjs(fechaRegistro).add(eventConfig.vencimientoDias, 'day').format('YYYY-MM-DD HH:mm:ss');
                }
                if (eventName === "acto_administrativo" && (estado_resultado === "Cerrada Exitosamente" || estado_resultado === "Cerrada No Exitosa")) {
                    updateSolicitudFields.fecha_cierre = fechaRegistro;
                    updateSolicitudFields.motivo_cierre = comentario_proceso;
                }
                break;

            case "radicacion_areas":
                newSolicitudState = eventConfig.nextState;
                // Al radicar en áreas, se marcan las aprobaciones de área como 'Aplica' o 'No Aplica' si se envían los datos
                // O se asume 'Aplica' por defecto si están involucradas.
                // Aquí, asumo que el frontend enviaría `areas_involucradas` o una decisión `aplica_area_X`.
                // Si el diseño es que se definen como 'Aplica' solo si el proceso pasa por ellas,
                // entonces los valores por defecto NULL en DB son correctos.
                // Si `areas_involucradas` indica que una aprobación no aplica, la podrías marcar como 'No Aplica'.
                // Por simplicidad, si el área está en `areas_involucradas`, asumimos que 'Aplica'.
                // Si no, se queda en NULL (hasta que se decida 'No Aplica' explícitamente).
                if (areas_involucradas?.includes(ROLES.CALIDAD)) { updateSolicitudFields.aprobacion_calidad = 'Aplica'; }
                if (areas_involucradas?.includes(ROLES.PLANEACION)) { updateSolicitudFields.aprobacion_planeacion = 'Aplica'; }
                if (areas_involucradas?.includes(ROLES.FINANCIERO)) { updateSolicitudFields.aprobacion_financiero = 'Aplica'; }

                // Considera si 'aprobacion_iyv' también se marca aquí como 'Aplica' si aún no está.
                // Por ahora, IYV ya la marcó en 'verificacion_documentos_iyv'
                break;

            case "verificacion_area":
                if (!estado_resultado) {
                    await connection.rollback();
                    return res.status(400).json({ message: `Resultado de la verificación de área no válido.` });
                }
                let areaField = null;
                switch (usuarioResponsableRol) {
                    case ROLES.CALIDAD: areaField = 'aprobacion_calidad'; break;
                    case ROLES.PLANEACION: areaField = 'aprobacion_planeacion'; break;
                    case ROLES.FINANCIERO: areaField = 'aprobacion_financiero'; break;
                }
                if (!areaField) {
                    await connection.rollback();
                    return res.status(403).json({ message: 'Su rol no está asociado a una aprobación de área específica.' });
                }

                // Aquí, el estado_resultado del evento de verificación de área es el que determina
                // si la solicitud requiere subsanación o avanza. No cambia el 'Aplica'/'No Aplica' del campo de aprobación.
                // Ese campo solo indica si esa aprobación particular era necesaria o no.
                // El estado general de la solicitud y los comentarios del evento son los que marcan el resultado.

                // Si se llega aquí, el campo de aprobación (`aprobacion_calidad`, etc.) ya debería estar 'Aplica'
                // O se asume que si se ejecuta una verificación, es porque aplica.

                // La lógica del estado_resultado ahora se enfoca en el progreso del proceso, no en el valor de "Aplica/No Aplica"
                // de la aprobación en sí.
                if (estado_resultado.includes('No Aprobado') && estado_resultado.includes('Subsanación')) {
                    newSolicitudState = "Subsanación de documentos Área";
                    fechaProximaAccion = dayjs(fechaRegistro).add(getProcessEventByName("recepcion_subsanacion_area").vencimientoDias, 'day').format('YYYY-MM-DD HH:mm:ss');
                } else if (estado_resultado.includes('Aprobado')) {
                    // Si todas las aprobaciones aplicables están resueltas (ya sea 'Aplica' o 'No Aplica'
                    // y el proceso ha avanzado para ellas), se pasa al siguiente estado.
                    // Esto requeriría una función `checkAllAprobacionesResueltas` diferente.
                    // Por ahora, solo avanza el estado.
                     newSolicitudState = "Para Visita o Acto Administrativo"; // Ejemplo de avance
                } else {
                    await connection.rollback();
                    return res.status(400).json({ message: 'Resultado de verificación de área desconocido.' });
                }
                break;


            case "visita_inspeccion_vigilancia":
                updateSolicitudFields.contador_visitas = (currentSolicitud.contador_visitas || 0) + 1;
                newSolicitudState = eventConfig.nextStates[estado_resultado];
                break;

            case "cierre_solicitud":
                newSolicitudState = estado_resultado;
                updateSolicitudFields.fecha_cierre = fechaRegistro;
                updateSolicitudFields.motivo_cierre = motivo_cierre || comentario_proceso;
                break;

            default:
                if (eventConfig.nextState) {
                    newSolicitudState = eventConfig.nextState;
                } else if (eventConfig.nextStates && estado_resultado) {
                    newSolicitudState = eventConfig.nextStates[estado_resultado];
                }
                break;
        }

        // 3. Actualizar la Solicitud
        let updateQuery = `UPDATE Solicitudes SET estado_actual = ?`;
        let queryParams = [newSolicitudState];

        for (const key in updateSolicitudFields) {
            if (updateSolicitudFields[key] !== undefined) {
                updateQuery += `, ${key} = ?`;
                queryParams.push(updateSolicitudFields[key]);
            }
        }
        updateQuery += ` WHERE id = ?`;
        queryParams.push(solicitudId);

        await connection.execute(updateQuery, queryParams);

        // 4. Insertar el EventoProceso
        await connection.execute(
            `INSERT INTO EventosProceso (
                solicitud_id, nombre_proceso, fecha_registro, usuario_responsable_id,
                estado_resultado, comentario_proceso, area_involucrada, documentos_adjuntos, fecha_proxima_accion
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                solicitudId,
                eventConfig.label, fechaRegistro, usuarioResponsableId,
                estado_resultado || (eventConfig.statusOptions ? eventConfig.statusOptions[0] : null),
                comentario_proceso,
                usuarioResponsableRol,
                documentos_adjuntos ? JSON.stringify(documentos_adjuntos) : null,
                fechaProximaAccion
            ]
        );

        await connection.commit();
        res.status(200).json({ message: 'Evento de proceso registrado y solicitud actualizada.', newStatus: newSolicitudState });

    } catch (error) {
        await connection.rollback();
        console.error(`Error al manejar el evento de proceso '${eventName}' para la solicitud ${solicitudId}:`, error);
        res.status(500).json({ message: 'Error interno del servidor al procesar el evento.' });
    } finally {
        connection.release();
    }
};

exports.deleteSolicitud = async (req, res) => {
    const { id } = req.params;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        // Eliminar eventos relacionados primero debido a la FK
        await connection.execute(`DELETE FROM EventosProceso WHERE solicitud_id = ?`, [id]);
        const [result] = await connection.execute(`DELETE FROM Solicitudes WHERE id = ?`, [id]);

        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Solicitud no encontrada.' });
        }

        await connection.commit();
        res.status(200).json({ message: 'Solicitud eliminada exitosamente.' });
    } catch (error) {
        await connection.rollback();
        console.error('Error al eliminar solicitud:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    } finally {
        connection.release();
    }
};