// pm2 inside the Docker image: keeps the backend and the frontend running
// (nginx is started before pm2 by the image's CMD)
module.exports = {
  apps: [
    {
      name: 'backend',
      cwd: '/app/apps/backend',
      script: 'dist/apps/backend/src/main.js',
      env: { PORT: '3000' },
      max_memory_restart: '400M',
    },
    {
      name: 'frontend',
      cwd: '/app/apps/frontend',
      script: '/app/node_modules/next/dist/bin/next',
      args: 'start -p 4200 -H 127.0.0.1',
      max_memory_restart: '400M',
    },
  ],
};
