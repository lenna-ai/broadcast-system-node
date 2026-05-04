module.exports = {
  apps: [
    { name: "api-server", script: "./server.js", instances: 1 },
    { name: "worker-wa", script: "./src/index.js", instances: 3 },
  ]
};
