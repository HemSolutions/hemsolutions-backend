"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendEmail = sendEmail;
exports.getInvoiceEmailTemplate = getInvoiceEmailTemplate;
exports.getReminderEmailTemplate = getReminderEmailTemplate;
exports.getPasswordResetEmailTemplate = getPasswordResetEmailTemplate;
exports.getBookingConfirmationEmailTemplate = getBookingConfirmationEmailTemplate;
const mail_1 = __importDefault(require("@sendgrid/mail"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const config_1 = require("../config");
const logger_1 = require("./logger");
if (config_1.config.email.sendgridApiKey) {
    mail_1.default.setApiKey(config_1.config.email.sendgridApiKey);
}
async function sendEmail(data) {
    if (config_1.config.email.sendgridApiKey) {
        try {
            await mail_1.default.send({
                to: data.to,
                from: {
                    email: config_1.config.email.from,
                    name: config_1.config.email.fromName
                },
                subject: data.subject,
                text: data.text,
                html: data.html
            });
            return;
        }
        catch (error) {
            logger_1.logger.error('SendGrid email failed', error);
            throw new Error('Failed to send email');
        }
    }
    const smtpHost = process.env.SMTP_HOST?.trim();
    const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
    const smtpUser = process.env.SMTP_USER?.trim();
    const smtpPass = process.env.SMTP_PASS?.trim();
    const smtpSecure = process.env.SMTP_SECURE === '1' || process.env.SMTP_SECURE === 'true';
    if (!smtpHost || !smtpUser || !smtpPass) {
        logger_1.logger.warn('No email provider configured. Skipping email delivery.', { subject: data.subject });
        return;
    }
    try {
        const transporter = nodemailer_1.default.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpSecure,
            auth: { user: smtpUser, pass: smtpPass },
        });
        await transporter.sendMail({
            to: data.to,
            from: `"${config_1.config.email.fromName}" <${config_1.config.email.from}>`,
            subject: data.subject,
            text: data.text,
            html: data.html,
        });
    }
    catch (error) {
        logger_1.logger.error('SMTP email failed', error);
        throw new Error('Failed to send email');
    }
}
function getInvoiceEmailTemplate(input) {
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
function getReminderEmailTemplate(input) {
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
function getPasswordResetEmailTemplate(resetUrl, firstName) {
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
function getBookingConfirmationEmailTemplate(firstName, serviceName, date, time) {
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
//# sourceMappingURL=email.js.map