const router = require('express').Router();
const {
  startSession, endSession, submitResults,
  listSessions, getSession, getReport, getStats,
} = require('../controllers/sessionController');
const { requireAuth, optionalAuth } = require('../middleware/auth');

router.post('/start',          optionalAuth, startSession);
router.post('/:id/end',        endSession);
router.post('/:id/results',    submitResults);
router.get('/',                requireAuth, listSessions);
router.get('/stats',           requireAuth, getStats);     // must be before /:id
router.get('/:id',             requireAuth, getSession);
router.get('/:id/report',      requireAuth, getReport);

module.exports = router;
