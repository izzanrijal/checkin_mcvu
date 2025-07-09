module.exports = {
  apps: [
    {
      name: "bolt-scanner",
      script: "npm",
      args: "start",
      cwd: "./",
      instances: "max",
      exec_mode: "cluster",
      watch: false,
      env: {
        PORT: 3008,
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://scan.perkimakassar.com"
      },
      max_memory_restart: "1G",
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
