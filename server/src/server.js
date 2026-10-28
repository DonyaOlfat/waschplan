import { createApp } from './app.js';
import { env } from './config/env.js';

createApp().listen(env.PORT, (error) => {
  if (error) {
    console.error(error);
    process.exit(1);
  }

  console.log(`Waschplan API listening on http://localhost:${env.PORT}`);
});
