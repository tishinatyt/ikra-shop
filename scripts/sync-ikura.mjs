import { run } from './fetch-ikura.mjs';

run().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
