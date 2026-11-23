const { createHash } = require('node:crypto');
const { createReadStream } = require('node:fs');

async function sha256File(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

module.exports = { sha256File };
