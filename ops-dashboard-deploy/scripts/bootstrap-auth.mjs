#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function usage(msg) {
  console.error(msg);
  console.error('\nUsage: node scripts/bootstrap-auth.mjs <auth-file> <username> <password>');
  process.exit(1);
}

const [, , authFile, username, password] = process.argv;
if (!authFile) usage('Missing auth file path.');
if (!username) usage('Missing username.');
if (!password || password.length < 12) usage('Password must be at least 12 characters.');

const salt = crypto.randomBytes(16).toString('hex');
const passwordHash = crypto.pbkdf2Sync(password, Buffer.from(salt, 'hex'), 120000, 32, 'sha256').toString('hex');

fs.mkdirSync(path.dirname(authFile), { recursive: true });
const payload = {
  username,
  salt,
  passwordHash,
  mustChangePassword: false,
  updatedAt: new Date().toISOString(),
};

fs.writeFileSync(authFile, JSON.stringify(payload, null, 2));
console.log(`Seeded ${authFile} for user ${username}.`);
