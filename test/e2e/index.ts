// Mocha entry point that VS Code's test host calls inside the extension host.
import * as path from 'node:path';
import Mocha from 'mocha';

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', timeout: 120_000, color: true });
  mocha.addFile(path.join(__dirname, 'scenarios.test.js'));
  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures) reject(new Error(`${failures} e2e scenario(s) failed`));
      else resolve();
    });
  });
}
