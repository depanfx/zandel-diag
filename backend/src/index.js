require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { testConnection } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'Zandel Diag' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/sessions', require('./routes/sessions'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: true, message: 'Internal server error' });
});

testConnection().then(() => {
  app.listen(PORT, () => {
    console.log(`Zandel Diag backend running on port ${PORT}`);
  });
});
