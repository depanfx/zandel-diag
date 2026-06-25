const bcrypt = require('bcryptjs');
const { query } = require('../config/database');

const listUsers = async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, username, role, created_at, last_login, is_active FROM users ORDER BY created_at ASC'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
};

const createUser = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: true, message: 'Username dan password wajib diisi' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: true, message: 'Password minimal 8 karakter' });
    }

    const existing = await query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: true, message: 'Username sudah digunakan' });
    }

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'technician') RETURNING id, username, role, created_at",
      [username, hash]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
};

const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { username, password, is_active } = req.body;

    if (!username && !password && is_active === undefined) {
      return res.status(400).json({ error: true, message: 'Tidak ada data yang diupdate' });
    }

    const existing = await query('SELECT id FROM users WHERE id = $1', [id]);
    if (!existing.rows[0]) {
      return res.status(404).json({ error: true, message: 'User tidak ditemukan' });
    }

    if (username) {
      const conflict = await query('SELECT id FROM users WHERE username = $1 AND id != $2', [username, id]);
      if (conflict.rows.length > 0) {
        return res.status(409).json({ error: true, message: 'Username sudah digunakan' });
      }
      await query('UPDATE users SET username = $1 WHERE id = $2', [username, id]);
    }

    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: true, message: 'Password minimal 8 karakter' });
      }
      const hash = await bcrypt.hash(password, 12);
      await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, id]);
    }

    if (is_active !== undefined) {
      if (id === req.user.id) {
        return res.status(400).json({ error: true, message: 'Tidak bisa mengubah status akun sendiri' });
      }
      await query('UPDATE users SET is_active = $1 WHERE id = $2', [!!is_active, id]);
    }

    const { rows } = await query(
      'SELECT id, username, role, created_at, last_login, is_active FROM users WHERE id = $1',
      [id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
};

const deactivateUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ error: true, message: 'Tidak bisa menonaktifkan akun sendiri' });
    }

    const { rows } = await query(
      'UPDATE users SET is_active = false WHERE id = $1 RETURNING id',
      [id]
    );
    if (!rows[0]) {
      return res.status(404).json({ error: true, message: 'User tidak ditemukan' });
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

module.exports = { listUsers, createUser, updateUser, deactivateUser };
