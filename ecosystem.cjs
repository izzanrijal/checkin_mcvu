module.exports = {
  apps: [
    {
      name: "bolt-scanner",
      script: "npm",
      args: "run preview",
      cwd: "./",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3060,
        VITE_PUBLIC_URL: "https://scan.perkimakassar.com"
      },
      // Post deployment hooks
      post_update: [
        "echo 'Starting post-pull deployment process...'",
        "npm install",
        "npm run build",
        "echo 'Deployment process completed, restarting application...'"
      ]
    }
  ],
  // Custom deployment commands
  deploy: {
    production: {
      "post-deploy": "npm install && npm run build && pm2 reload ecosystem.cjs --env production",
      "pre-setup": ""
    }
  }
};
