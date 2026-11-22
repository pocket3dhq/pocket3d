process.env.TZ = 'UTC';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { SessionsService } from '@pocket3d/nestjs-libraries/database/prisma/sessions/sessions.service';
import { loadSwagger } from '@pocket3d/helpers/swagger/load.swagger';
import { ConfigurationChecker } from '@pocket3d/helpers/configuration/configuration.checker';

async function start() {
  // No CORS: only the Next.js server (same machine) and the CLI call the API
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);

  loadSwagger(app);

  const port = process.env.PORT || 3000;

  try {
    await app.listen(port);
    // Expired sessions are already refused; this only keeps the table small
    app
      .get(SessionsService)
      .purgeExpired()
      .catch((err) => Logger.warn(`Could not purge expired sessions: ${err}`));
    checkConfiguration(); // last, so issues show at the end of the startup log
    Logger.log(`🚀 Backend is running on: http://localhost:${port}`);
  } catch (e) {
    Logger.error(`Backend failed to start on port ${port}`, e);
  }
}

function checkConfiguration() {
  const checker = new ConfigurationChecker();
  checker.readEnvFromProcess();
  checker.check();

  if (checker.hasIssues()) {
    for (const issue of checker.getIssues()) {
      Logger.warn(issue, 'Configuration issue');
    }
    Logger.warn('Configuration issues found: ' + checker.getIssuesCount());
  } else {
    Logger.log('Configuration check completed without any issues');
  }
}

start();
