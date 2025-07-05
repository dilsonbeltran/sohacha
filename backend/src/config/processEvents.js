// Define los estados que requieren aprobación por un área específica
// OJO: Estos nombres de roles deben coincidir con los de tu DB y JWT
export const ROLES = {
    IYV: 'IyV',
    ADMIN: 'Administrador',
    CALIDAD: 'Area_Calidad',
    PLANEACION: 'Area_Planeacion',
    FINANCIERO: 'Area_Financiero',
};

// Define los diferentes tipos de eventos del proceso
// Esto guiará la lógica en el backend y la UI en el frontend
export const PROCESS_EVENTS = [
    {
        name: "recepcion_solicitud",
        label: "Recepción de Solicitud",
        description: "Se recibe la solicitud inicial del usuario.",
        allowedRoles: [ROLES.IYV],
        initialState: true, // Indica que es el primer evento al crear una solicitud
        nextState: "Recibido Inspección y Vigilancia",
        requiresApproval: false,
        formFields: ["solicitante", "radicado", "tipo_solicitud", "correo_electronico_solicitante", "comentario_inicial"],
        statusOptions: ["Recibido Inspección y Vigilancia"], // Este sería el estado por defecto para este evento
    },
    {
        name: "verificacion_documentos_iyv",
        label: "Verificación Documentos IyV",
        description: "El área de Inspección y Vigilancia verifica los documentos iniciales.",
        allowedRoles: [ROLES.IYV],
        previousState: "Recibido Inspección y Vigilancia",
        nextStates: { // Opciones de resultado y sus estados siguientes
            "Documentos OK - Para Radicación en Áreas": "Para Radicación en Áreas",
            "Subsanación de documentos IyV": "Subsanación de documentos IyV",
            "Cerrada No Exitosa": "Cerrada No Exitosa" // Opción para cerrar si no cumple
        },
        requiresApproval: false, // La verificación es una acción, no una aprobación externa
        formFields: ["estado_resultado", "comentario_proceso", "documentos_adjuntos"],
    },
    {
        name: "recepcion_subsanacion_iyv", // Cuando el usuario envía la subsanación
        label: "Recepción Subsanación IyV",
        description: "El solicitante ha enviado los documentos de subsanación requeridos por IyV.",
        allowedRoles: [ROLES.IYV], // IyV es quien la "recibe" y revisa
        previousState: "Subsanación de documentos IyV",
        nextStates: {
            "Subsanación Completa - Para Radicación en Áreas": "Para Radicación en Áreas",
            "Subsanación Incompleta - Cierre": "Cerrada No Exitosa",
        },
        requiresApproval: false,
        formFields: ["estado_resultado", "comentario_proceso", "documentos_adjuntos"],
        vencimientoDias: 8, // Este se calcula desde que se puso en "Subsanación de documentos IyV"
    },
    {
        name: "radicacion_areas",
        label: "Radicar Solicitud en Áreas",
        description: "La solicitud se radica para verificación en las áreas correspondientes.",
        allowedRoles: [ROLES.IYV],
        previousState: "Para Radicación en Áreas",
        nextState: "Para Verificación en Áreas",
        requiresApproval: false,
        formFields: ["comentario_proceso", "areas_involucradas"], // Campo para seleccionar qué áreas
        // Aquí podríamos añadir lógica para 'aprobacion_calidad', 'aprobacion_planeacion', 'aprobacion_financiero'
        // se ponen en NULL o se reinician, y el estado de la solicitud se mueve a "Para Verificación en Áreas"
    },
    {
        name: "verificacion_area",
        label: "Verificación en Área",
        description: "El área correspondiente verifica los aspectos de la solicitud.",
        allowedRoles: [ROLES.CALIDAD, ROLES.PLANEACION, ROLES.FINANCIERO], // Ojo: Una sola ruta, pero el rol determina qué 'aprobacion_...' actualiza
        previousState: "Para Verificación en Áreas",
        nextStates: { // El estado de la solicitud puede seguir siendo 'Para Verificación en Áreas' hasta que todas aprueben
            "Aprobado por [Área]": "Para Verificación en Áreas", // O 'En Verificación' si no todas han terminado
            "No Aprobado por [Área] - Subsanación": "Subsanación de documentos Área",
        },
        requiresApproval: true, // Esto implica que actualiza un campo 'aprobacion_area'
        formFields: ["estado_resultado", "comentario_proceso", "documentos_adjuntos"],
        // Este evento no cambia el estado final de la solicitud hasta que todas las áreas hayan dado su veredicto.
        // La lógica en el backend determinará si todas las aprobaciones están completas o si se requiere subsanación.
    },
    {
        name: "recepcion_subsanacion_area",
        label: "Recepción Subsanación Área",
        description: "El solicitante ha enviado los documentos de subsanación requeridos por las Áreas.",
        allowedRoles: [ROLES.CALIDAD, ROLES.PLANEACION, ROLES.FINANCIERO], // La recibe el área que la solicitó
        previousState: "Subsanación de documentos Área",
        nextStates: {
            "Subsanación Completa - Para Acto Administrativo": "Para Acto Administrativo",
            "Subsanación Incompleta - Cierre": "Cerrada No Exitosa",
        },
        requiresApproval: false,
        formFields: ["estado_resultado", "comentario_proceso", "documentos_adjuntos"],
        vencimientoDias: 20, // Este se calcula desde que se puso en "Subsanación de documentos Área"
    },
    {
        name: "visita_inspeccion_vigilancia",
        label: "Visita de Inspección/Vigilancia",
        description: "Realización de visita de inspección/vigilancia.",
        allowedRoles: [ROLES.IYV],
        previousState: ["Para Acto Administrativo", "Visita Programada"], // Podría ser un estado intermedio
        nextStates: {
            "Visita Realizada - Para Acto Administrativo": "Para Acto Administrativo",
            "Visita Programada": "Visita Programada", // Si se programa pero no se ejecuta
        },
        requiresApproval: false,
        formFields: ["fecha_visita", "hora_visita", "comentario_proceso", "documentos_adjuntos"],
        incrementsCounter: "contador_visitas", // Indicar que incrementa el contador de visitas
    },
    {
        name: "acto_administrativo",
        label: "Acto Administrativo",
        description: "Generación y registro del acto administrativo.",
        allowedRoles: [ROLES.IYV],
        previousState: "Para Acto Administrativo",
        nextStates: {
            "Cerrada Exitosamente": "Cerrada Exitosamente",
            "Cerrada No Exitosa": "Cerrada No Exitosa", // Si el acto administrativo es negativo
        },
        requiresApproval: false,
        formFields: ["estado_resultado", "comentario_proceso", "documentos_adjuntos"],
    },
    {
        name: "cierre_solicitud", // Evento de cierre genérico
        label: "Cierre de Solicitud",
        description: "La solicitud ha sido cerrada.",
        allowedRoles: [ROLES.IYV, ROLES.ADMIN], // IyV y Admin pueden cerrar
        previousState: ["Cerrada Exitosamente", "Cerrada No Exitosa"], // Este estado ya está establecido por otro evento
        nextState: null, // Ya es un estado final
        requiresApproval: false,
        formFields: ["motivo_cierre", "comentario_proceso"], // Motivo de cierre (campo ya existente en solicitud)
    },
];

// Opcional: Función para obtener un evento por su nombre
export const getProcessEventByName = (name) => PROCESS_EVENTS.find(event => event.name === name);
