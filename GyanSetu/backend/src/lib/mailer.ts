import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from './logger';

const transport = env.SMTP_URL ? nodemailer.createTransport(env.SMTP_URL) : null;

export async function sendMail(to: string, subject: string, text: string) {
  if (!transport) {
    logger.warn({ to, subject, text }, 'SMTP not configured, email printed instead of sent');
    return;
  }
  await transport.sendMail({ from: env.MAIL_FROM, to, subject, text });
}
