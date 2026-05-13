module.exports = {
  apps : [
    {
      name: "broadcast-queue-worker",
      script: "./src/workers/broadcast.worker.js", // Merujuk ke baris 7 di image_4770c0.png
      instances: 2, // Anda bisa sesuaikan jumlah worker untuk memproses antrean lebih cepat
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_local: {
        NODE_ENV: "local",
        DOTENV_CONFIG_PATH: "./.env"
      },
      env_production: {
        NODE_ENV: "production",
        DOTENV_CONFIG_PATH: "./.env"
      }
    },
    {
      name: "broadcast-server",
      script: "./server.js", // Merujuk ke baris 7 di image_4770c0.png
      instances: 2, // Anda bisa sesuaikan jumlah worker untuk memproses antrean lebih cepat
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_local: {
        NODE_ENV: "local",
        DOTENV_CONFIG_PATH: "./.env"
      },
      env_production: {
        NODE_ENV: "production",
        DOTENV_CONFIG_PATH: "./.env"
      }
    },
  ]
};