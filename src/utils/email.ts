import sgMail from '@sendgrid/mail';
import nodemailer from 'nodemailer';
import { config } from '../config';
import { logger } from './logger';

if (config.email.sendgridApiKey) {
  sgMail.setApiKey(config.email.sendgridApiKey);
}

interface EmailData {
  to: string;
  subject: string;
  text?: string;
  html: string;
}

export async function sendEmail(data: EmailData): Promise<void> {
  if (config.email.sendgridApiKey) {
    try {
      await sgMail.send({
        to: data.to,
        from: {
          email: config.email.from,
          name: config.email.fromName
        },
        subject: data.subject,
        text: data.text,
        html: data.html
      });
      return;
    } catch (error) {
      logger.error('SendGrid email failed', error);
      throw new Error('Failed to send email');
    }
  }

  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  const smtpSecure = process.env.SMTP_SECURE === '1' || process.env.SMTP_SECURE === 'true';

  if (!smtpHost || !smtpUser || !smtpPass) {
    logger.warn('No email provider configured. Skipping email delivery.', { subject: data.subject });
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: { user: smtpUser, pass: smtpPass },
    });
    await transporter.sendMail({
      to: data.to,
      from: `"${config.email.fromName}" <${config.email.from}>`,
      subject: data.subject,
      text: data.text,
      html: data.html,
    });
  } catch (error) {
    logger.error('SMTP email failed', error);
    throw new Error('Failed to send email');
  }
}

export type InvoiceEmailTemplateInput = {
  customerName: string;
  invoiceNumber: string;
  dueDate: Date;
  total: number;
  status: string;
  paymentUrl?: string;
};

export function getInvoiceEmailTemplate(input: InvoiceEmailTemplateInput): string {
  const due = input.dueDate.toISOString().slice(0, 10);
  const payCta = input.paymentUrl
    ? `<p><a href="${input.paymentUrl}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px;">View invoice</a></p>`
    : '';
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222;">
      <h2>Invoice ${input.invoiceNumber}</h2>
      <p>Hello ${input.customerName},</p>
      <p>Your invoice is now available.</p>
      <ul>
        <li>Total: ${input.total.toFixed(2)} SEK</li>
        <li>Status: ${input.status}</li>
        <li>Due date: ${due}</li>
      </ul>
      ${payCta}
      <p>If you already paid this invoice, no further action is required.</p>
    </div>
  `;
}

export type ReminderEmailTemplateInput = {
  customerName: string;
  invoiceNumber: string;
  dueDate: Date;
  total: number;
  message?: string;
  paymentUrl?: string;
};

export function getReminderEmailTemplate(input: ReminderEmailTemplateInput): string {
  const due = input.dueDate.toISOString().slice(0, 10);
  const payCta = input.paymentUrl
    ? `<p><a href="${input.paymentUrl}" style="display:inline-block;background:#dc2626;color:#fff;padding:10px 16px;text-decoration:none;border-radius:6px;">Pay invoice</a></p>`
    : '';
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222;">
      <h2>Payment reminder for invoice ${input.invoiceNumber}</h2>
      <p>Hello ${input.customerName},</p>
      <p>This is a reminder that your invoice is due.</p>
      <ul>
        <li>Total due: ${input.total.toFixed(2)} SEK</li>
        <li>Due date: ${due}</li>
      </ul>
      ${input.message ? `<p>Message: ${input.message}</p>` : ''}
      ${payCta}
    </div>
  `;
}

export function getPasswordResetEmailTemplate(resetUrl: string, firstName: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f59e0b; color: white; padding: 30px; text-align: center; }
        .content { background: #f9fafb; padding: 30px; }
        .button { display: inline-block; background: #f59e0b; color: white; padding: 12px 30px; 
                  text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>HemSolutions</h1>
        </div>
        <div class="content">
          <h2>Hi ${firstName},</h2>
          <p>You requested a password reset for your HemSolutions account.</p>
          <p>Click the button below to reset your password. This link expires in 1 hour.</p>
          <a href="${resetUrl}" class="button">Reset Password</a>
          <p>If you didn't request this, please ignore this email.</p>
          <p>Or copy and paste this URL into your browser:</p>
          <p>${resetUrl}</p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} HemSolutions. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function getBookingConfirmationEmailTemplate(
  firstName: string, 
  serviceName: string, 
  date: string, 
  time: string
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #f59e0b; color: white; padding: 30px; text-align: center; }
        .content { background: #f9fafb; padding: 30px; }
        .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #6b7280; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>HemSolutions</h1>
        </div>
        <div class="content">
          <h2>Booking Confirmed!</h2>
          <p>Hi ${firstName},</p>
          <p>Your cleaning service has been confirmed. Here are the details:</p>
          <div class="details">
            <p><strong>Service:</strong> ${serviceName}</p>
            <p><strong>Date:</strong> ${date}</p>
            <p><strong>Time:</strong> ${time}</p>
          </div>
          <p>We'll send you a reminder before your appointment.</p>
        </div>
        <div class="footer">
          <p>© ${new Date().getFullYear()} HemSolutions. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
