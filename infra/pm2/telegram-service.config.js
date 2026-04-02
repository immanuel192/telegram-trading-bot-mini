module.exports = {
  name: "telegram-service",
  script: "./dist/apps/telegram-service/main.js",
  instances: 1,
  exec_mode: "fork",
  env: {
    NODE_ENV: "production"
  },
  restart_delay: 4000,
  max_restarts: 10,
  min_uptime: "10s",
  watch: false,
  error_file: "./logs/telegram-service-error.log",
  out_file: "./logs/telegram-service-out.log",
  log_date_format: "YYYY-MM-DD HH:mm:ss Z"
};
