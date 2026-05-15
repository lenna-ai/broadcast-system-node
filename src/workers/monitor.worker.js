const pm2 = require('pm2');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();


const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: { 
    user: process.env.SMTP_USERNAME, 
    pass: process.env.SMTP_PASSWORD 
  }
});

// Object untuk mengunci/menahan spam alert ganda dalam waktu bersamaan (Debounce)
const alertCooldowns = {};

pm2.connect((err) => {
  if (err) {
    console.error('Failed to connect to PM2:', err);
    process.exit(2);
  }

  console.log('PM2 Monitor is running, listening for events...');

  pm2.launchBus((err, pm2_bus) => {
    if (err) return console.error(err);

    pm2_bus.on('process:event', (data) => {
      const appName = data.process.name;
      const status = data.event;

      if (appName === 'pm2-email-monitor') return; 
      if (status === 'exit' || status === 'stop') {
        const restartCount = data.process.pm2_env ? data.process.pm2_env.restart_time : 0;
        
        const now = Date.now();
        if (alertCooldowns[appName] && (now - alertCooldowns[appName] < 3000)) {
          return;
        }

        alertCooldowns[appName] = now;

        console.log(`[ALERT] Application ${appName} has CRASHED/EXIT (Total Restarts: ${restartCount})`);
        sendEmailAlert(appName, `exit (Crashed/stopped automatically after ${restartCount} restarts)`);
      }
      
      if (status === 'stop') {
        console.log(`[INFO] Application ${appName} was manually stopped by an administrator.`);
        sendEmailAlert(appName, 'stopped manually by administrator');
      }
    });
  });
});

function sendEmailAlert(appName, status) {
  const mailOptions = {
    from: '"PM2 Monitor" <mailer@lenna.ai>',
    to: 'dimas@lenna.ai',
    subject: `🚨 ALERT: Application ${appName} IS DOWN!`,
    text: `The PM2 process for application "${appName}" detected the following status: ${status} at ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}. Please check the server immediately.`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) return console.error('Failed to send email:', error);
    console.log(`Notification email for [${appName}] sent: ` + info.response);
  });
}