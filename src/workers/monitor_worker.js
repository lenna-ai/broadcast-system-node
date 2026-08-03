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

// Track services that already sent a down-alert until they recover (online).
const alertSent = {};

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

      if (status === 'online') {
        if (alertSent[appName]) {
          console.log(`[INFO] Application ${appName} is back online — alert reset`);
        }
        delete alertSent[appName];
        return;
      }

      if (status === 'exit') {
        if (alertSent[appName]) {
          console.log(`[INFO] Alert already sent for [${appName}], skipping duplicate`);
          return;
        }

        alertSent[appName] = true;
        const restartCount = data.process.pm2_env ? data.process.pm2_env.restart_time : 0;

        console.log(`[ALERT] Application ${appName} in ${process.env.APP_ENV || 'development'} has CRASHED/EXIT (Total Restarts: ${restartCount})`);
        sendEmailAlert(appName, `exit (Crashed/stopped automatically after ${restartCount} restarts)`);
        return;
      }

      if (status === 'stop') {
        if (alertSent[appName]) {
          console.log(`[INFO] Alert already sent for [${appName}], skipping duplicate`);
          return;
        }

        alertSent[appName] = true;
        console.log(`[INFO] Application ${appName} in ${process.env.APP_ENV || 'development'} was manually stopped by an administrator.`);
        sendEmailAlert(appName, 'stopped manually by administrator');
      }
    });
  });
});

function sendEmailAlert(appName, status) {
  const appEnv = process.env.APP_ENV || process.env.NODE_ENV || 'development';

  if (appEnv !== 'production') {
    console.log(`[INFO] Email alert skipped for [${appName}] (${appEnv})`);
    return;
  }

  const recipients = [
    'dimas@lenna.ai', 
    'ryanzulham@lenna.ai', 
    'annisa@lenna.ai', 
    'fachry@lenna.ai', 
    'operation@lenna.ai',
    'allam@lenna.ai',
    'savarel@lenna.ai'
  ];
  const mailOptions = {
    from: '"Broadcast Monitor" <mailer@lenna.ai>',
    to: recipients.join(','),
    subject: `🚨 ALERT: Application ${appName} IS DOWN!`,
    text: `The PM2 process for application "${appName}" detected the following status: ${status} at ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}. Please check the server immediately.`
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) return console.error('Failed to send email:', error);
    console.log(`Notification email for [${appName}] sent: ` + info.response);
  });
}