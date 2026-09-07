import { readFileSync } from 'node:fs';

export function databaseTls() {
  const certificate = process.env.DATABASE_CA_CERT_PATH;
  return certificate
    ? { rejectUnauthorized: true, ca: readFileSync(certificate, 'utf8') }
    : undefined;
}
