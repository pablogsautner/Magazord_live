import crypto from 'node:crypto';
import { config } from '../config.js';

const ALGORITMO = 'aes-256-gcm';

function getChave() {
  const chave = Buffer.from(config.encryptionKey, 'hex');
  if (chave.length !== 32) {
    throw new Error('ENCRYPTION_KEY precisa ter 32 bytes em hex (64 caracteres). Gere com: openssl rand -hex 32');
  }
  return chave;
}

// Formato salvo no banco: iv:tag:dados (tudo em hex), pra cada valor ter seu próprio iv.
export function encrypt(texto) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITMO, getChave(), iv);
  const dados = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, dados].map((b) => b.toString('hex')).join(':');
}

export function decrypt(payload) {
  const [ivHex, tagHex, dadosHex] = payload.split(':');
  const decipher = crypto.createDecipheriv(ALGORITMO, getChave(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const dados = Buffer.concat([decipher.update(Buffer.from(dadosHex, 'hex')), decipher.final()]);
  return dados.toString('utf8');
}
