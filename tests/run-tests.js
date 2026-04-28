const fs = require("node:fs");
const path = require("node:path");

async function runTests(testFiles) {
  let passed = 0;
  let total = 0;

  for (const file of testFiles) {
    const tests = require(file);
    for (const currentTest of tests) {
      total += 1;
      try {
        await currentTest.run();
        passed += 1;
        console.log(`PASS ${currentTest.name}`);
      } catch (error) {
        console.error(`FAIL ${currentTest.name}`);
        console.error(error);
        process.exitCode = 1;
        return;
      }
    }
  }

  console.log(`OK ${passed}/${total} pruebas`);
}

function getTestFiles() {
  return fs.readdirSync(__dirname)
    .filter(fileName => fileName.endsWith(".test.js"))
    .sort()
    .map(fileName => path.join(__dirname, fileName));
}

runTests(getTestFiles());
