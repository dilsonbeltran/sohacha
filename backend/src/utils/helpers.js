const dayjs = require('dayjs');

// Function to calculate fecha_limite_proceso (6 months from fecha_radicacion)
const calculateDeadline = (radicacionDate) => {
    return dayjs(radicacionDate).add(6, 'month').toDate();
};

// Function to calculate subsanacion_iyv_deadline (8 days from event date)
const calculateSubsanacionIyVDeadline = (eventDate) => {
    return dayjs(eventDate).add(8, 'day').toDate();
};

// Function to calculate subsanacion_area_deadline (20 days from event date)
const calculateSubsanacionAreaDeadline = (eventDate) => {
    return dayjs(eventDate).add(20, 'day').toDate();
};

module.exports = {
    calculateDeadline,
    calculateSubsanacionIyVDeadline,
    calculateSubsanacionAreaDeadline
};
