const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: true, message: 'Username dan password wajib diisi' });
    }

    const { rows } = await query(
      'SELECT id, username, password_hash, role, is_active FROM users WHERE username = $1',
      [username]
    );

    const user = rows[0];
    if (!user || !user.is_active) {
      return res.status(401).json({ error: true, message: 'Username atau password salah' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: true, message: 'Username atau password salah' });
    }

    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    next(err);
  }
};

const me = async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, username, role, created_at, last_login FROM users WHERE id = $1 AND is_active = true',
      [req.user.id]
    );
    if (!rows[0]) {
      return res.status(401).json({ error: true, message: 'User tidak ditemukan' });
    }
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

const logout = (req, res) => {
  res.json({ success: true });
};

module.exports = { login, me, logout };
