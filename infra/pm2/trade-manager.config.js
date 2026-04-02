module.exports = {
  name: "trade-manager",
  script: "./dist/apps/trade-manager/main.js",
  // NOTE: MVP constraint - Redis Streams lack Kafka-style partition grouping
  // REQUIREMENT: Run exactly one instance to maintain message sequence
  instances: 1,
  exec_mode: "fork",
  env: {
    NODE_ENV: "production"
  },
  restart_delay: 4000,
  max_restarts: 10,
  min_uptime: "10s",
  watch: false,
  error_file: "./logs/trade-manager-error.log",
  out_file: "./logs/trade-manager-out.log",
  log_date_format: "YYYY-MM-DD HH:mm:ss Z"
};
