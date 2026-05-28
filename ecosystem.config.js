module.exports = {
  apps : [
    {
      name: "broadcast|queue",
      script: "./src/workers/broadcast_worker.js",
      instances: 3, 
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
      name: "broadcast|failed-queue",
      script: "./src/workers/failed_worker.js",
      instances: 2, 
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
      name: "broadcast|monitor",   
      script: "./src/workers/monitor_worker.js", 
      instances: 1,                
      exec_mode: "fork",
      autorestart: true,           
      watch: false,                
      env: {
        NODE_ENV: "development"
      },
      env_production: {
        NODE_ENV: "production"
      }
    },
    {
      name: "broadcast|server",
      script: "./server.js",
      instances: 1, 
      exec_mode: "fork",
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
      name: "broadcast|scheduler",
      script: "./src/scheduler.js",
      instances: 1, 
      exec_mode: "fork",
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
    }
  ]
};