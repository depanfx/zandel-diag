const { query } = require('../config/database');
const { DEVICE_LABELS, VALID_DEVICE_TYPES } = require('../utils/deviceLabels');

const VALID_STATUSES = ['pass', 'fail', 'skip', 'error'];

const formatReportDate = (date) => {
  const d = new Date(date);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const day    = String(d.getDate()).padStart(2, '0');
  const month  = months[d.getMonth()];
  const year   = d.getFullYear();
  const hh     = String(d.getHours()).padStart(2, '0');
  const mm     = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year} | ${hh}:${mm}`;
};

// POST /api/sessions/start
const startSession = async (req, res, next) => {
  try {
    const { device_type } = req.body;

    if (!device_type || !VALID_DEVICE_TYPES.includes(device_type)) {
      return res.status(400).json({
        error: true,
        message: `device_type harus salah satu dari: ${VALID_DEVICE_TYPES.join(', ')}`,
      });
    }

    const openedBy = req.user?.id ?? null;
    const isGuest  = openedBy === null;

    const { rows } = await query(
      `INSERT INTO sessions (device_type, opened_by, is_guest)
       VALUES ($1, $2, $3)
       RETURNING id AS session_id, device_type, started_at, is_guest`,
      [device_type, openedBy, isGuest]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
};

// POST /api/sessions/:id/end
const endSession = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { rows } = await query(
      `UPDATE sessions SET ended_at = NOW()
       WHERE id = $1 AND ended_at IS NULL
       RETURNING id AS session_id, ended_at`,
      [id]
    );

    if (!rows[0]) {
      return res.status(404).json({ error: true, message: 'Sesi tidak ditemukan atau sudah ditutup' });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

// POST /api/sessions/:id/results
const submitResults = async (req, res, next) => {
  try {
    const { id: sessionId } = req.params;
    const results = req.body;

    if (!Array.isArray(results) || results.length === 0) {
      return res.status(400).json({ error: true, message: 'Body harus berupa array hasil tes yang tidak kosong' });
    }

    for (const [i, r] of results.entries()) {
      if (!r.test_key || !r.test_label) {
        return res.status(400).json({ error: true, message: `Item [${i}]: test_key dan test_label wajib diisi` });
      }
      if (!VALID_STATUSES.includes(r.status)) {
        return res.status(400).json({
          error: true,
          message: `Item [${i}]: status '${r.status}' tidak valid. Harus salah satu dari: ${VALID_STATUSES.join(', ')}`,
        });
      }
    }

    const sessionCheck = await query('SELECT id FROM sessions WHERE id = $1', [sessionId]);
    if (!sessionCheck.rows[0]) {
      return res.status(404).json({ error: true, message: 'Sesi tidak ditemukan' });
    }

    const params = [];
    const placeholders = results.map((r, i) => {
      const b = i * 5;
      params.push(sessionId, r.test_key, r.test_label, r.status, r.detail ?? null);
      return `($${b+1}, $${b+2}, $${b+3}, $${b+4}, $${b+5})`;
    });

    await query(
      `INSERT INTO session_results (session_id, test_key, test_label, status, detail)
       VALUES ${placeholders.join(', ')}`,
      params
    );

    res.status(201).json({ inserted: results.length });
  } catch (err) {
    next(err);
  }
};

// GET /api/sessions
const listSessions = async (req, res, next) => {
  try {
    const { device_type, is_guest, limit = 20, offset = 0 } = req.query;

    const conditions = [];
    const params     = [];

    if (device_type) {
      if (!VALID_DEVICE_TYPES.includes(device_type)) {
        return res.status(400).json({ error: true, message: 'device_type tidak valid' });
      }
      params.push(device_type);
      conditions.push(`s.device_type = $${params.length}::device_type`);
    }

    if (is_guest === 'true' || is_guest === 'false') {
      params.push(is_guest === 'true');
      conditions.push(`s.is_guest = $${params.length}`);
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const limitVal    = Math.min(Math.max(parseInt(limit)  || 20, 1), 100);
    const offsetVal   = Math.max(parseInt(offset) || 0, 0);
    params.push(limitVal, offsetVal);

    const { rows } = await query(
      `SELECT s.id, s.device_type, s.is_guest, s.started_at, s.ended_at,
              u.username AS technician
       FROM sessions s
       LEFT JOIN users u ON s.opened_by = u.id
       ${whereClause}
       ORDER BY s.started_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json(rows);
  } catch (err) {
    next(err);
  }
};

// GET /api/sessions/stats
const getStats = async (req, res, next) => {
  try {
    const [countsRes, byDeviceRes] = await Promise.all([
      query(`
        SELECT
          COUNT(*)                                         AS total,
          COUNT(*) FILTER (WHERE ended_at IS NOT NULL)    AS completed,
          COUNT(*) FILTER (WHERE is_guest = true)         AS guest,
          COUNT(*) FILTER (WHERE is_guest = false)        AS authenticated
        FROM sessions
      `),
      query(`
        SELECT
          s.device_type,
          COUNT(DISTINCT s.id)                                                    AS count,
          ROUND(
            100.0
            * COUNT(sr.id) FILTER (WHERE sr.status = 'pass')
            / NULLIF(COUNT(sr.id) FILTER (WHERE sr.status IN ('pass','fail','error')), 0)
          )                                                                        AS avg_pass_rate
        FROM sessions s
        LEFT JOIN session_results sr ON sr.session_id = s.id
        GROUP BY s.device_type
        ORDER BY count DESC
      `),
    ]);

    const c = countsRes.rows[0];
    res.json({
      total:         parseInt(c.total),
      completed:     parseInt(c.completed),
      guest:         parseInt(c.guest),
      authenticated: parseInt(c.authenticated),
      by_device: byDeviceRes.rows.map(r => ({
        device_type:   r.device_type,
        count:         parseInt(r.count),
        avg_pass_rate: r.avg_pass_rate !== null ? parseInt(r.avg_pass_rate) : null,
      })),
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/sessions/:id
const getSession = async (req, res, next) => {
  try {
    const { id } = req.params;

    const sessionResult = await query(
      `SELECT s.id, s.device_type, s.is_guest, s.started_at, s.ended_at,
              u.username AS technician
       FROM sessions s
       LEFT JOIN users u ON s.opened_by = u.id
       WHERE s.id = $1`,
      [id]
    );

    if (!sessionResult.rows[0]) {
      return res.status(404).json({ error: true, message: 'Sesi tidak ditemukan' });
    }

    const resultsResult = await query(
      `SELECT test_key, test_label, status, detail, checked_at
       FROM session_results
       WHERE session_id = $1
       ORDER BY checked_at ASC`,
      [id]
    );

    const results = resultsResult.rows;
    const summary = { total: results.length, pass: 0, fail: 0, skip: 0, error: 0 };
    for (const r of results) summary[r.status]++;

    res.json({ session: sessionResult.rows[0], results, summary });
  } catch (err) {
    next(err);
  }
};

// GET /api/sessions/:id/report
const getReport = async (req, res, next) => {
  try {
    const { id } = req.params;

    const sessionResult = await query(
      'SELECT id, device_type, started_at FROM sessions WHERE id = $1',
      [id]
    );

    if (!sessionResult.rows[0]) {
      return res.status(404).json({ error: true, message: 'Sesi tidak ditemukan' });
    }

    const session = sessionResult.rows[0];

    const resultsResult = await query(
      `SELECT test_label, status, detail
       FROM session_results
       WHERE session_id = $1
       ORDER BY checked_at ASC`,
      [id]
    );

    const results  = resultsResult.rows;
    const summary  = { pass: 0, fail: 0, skip: 0, error: 0 };
    for (const r of results) summary[r.status]++;

    const deviceLabel = DEVICE_LABELS[session.device_type] || session.device_type;

    const lines = [
      'Zandel Diag — Service Report',
      `Date: ${formatReportDate(session.started_at)}`,
      `Device: ${deviceLabel}`,
      '',
      ...results.map((r) => {
        const tag  = `[${r.status.toUpperCase()}]`;
        const body = (r.detail && (r.status === 'fail' || r.status === 'error'))
          ? `${r.test_label} — ${r.detail}`
          : r.test_label;
        return `${tag} ${body}`;
      }),
      '---',
      `Result: ${summary.pass} PASS | ${summary.fail} FAIL | ${summary.skip} SKIP | ${summary.error} ERROR`,
    ];

    res.json({ report: lines.join('\n') });
  } catch (err) {
    next(err);
  }
};

module.exports = { startSession, endSession, submitResults, listSessions, getSession, getReport, getStats };
