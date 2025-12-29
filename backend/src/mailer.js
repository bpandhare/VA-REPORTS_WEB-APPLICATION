import nodemailer from 'nodemailer'

const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = process.env.SMTP_PORT
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const SMTP_SECURE = process.env.SMTP_SECURE === 'true'

let transporter = null
if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  })
}

export async function sendMail({ to, subject, text, html }) {
  if (!to) return Promise.reject(new Error('No recipient'))

  if (!transporter) {
    // Fallback: log the email instead of sending
    console.log('Mail (not sent, SMTP not configured):', { to, subject, text, html })
    return Promise.resolve()
  }

  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || SMTP_USER,
      to,
      subject,
      text,
      html
    })
    console.log('Email sent:', info.messageId)
    return info
  } catch (err) {
    console.warn('Failed to send email:', err?.message || err)
    throw err
  }
}
