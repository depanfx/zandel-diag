module.exports = {
  apps: [{
    name: 'zandel-diag',
    script: 'src/index.js',
    cwd: '/var/www/zandel-diag/backend',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env: {
      NODE_ENV: 'production',
    },
  }],
};
