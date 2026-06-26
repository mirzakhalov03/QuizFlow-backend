import nodemailer from 'nodemailer'

const emailAddress = process.env.EMAIL_ADDRESS
const emailAppPassword = process.env.EMAIL_APP_PASSWORD
const smtpHost = process.env.EMAIL_SMTP_HOST ?? 'smtp.gmail.com'
const smtpPort = Number(process.env.EMAIL_SMTP_PORT ?? '587')

if (!emailAddress || !emailAppPassword) {
  throw new Error('EMAIL_ADDRESS and EMAIL_APP_PASSWORD must be set to send email')
}

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: {
    user: emailAddress,
    pass: emailAppPassword,
  },
})

type SendEmailOptions = {
  to: string
  subject: string
  html?: string
  text?: string
  replyTo?: string
}

export const sendEmail = async ({ to, subject, html, text, replyTo }: SendEmailOptions) => {
  await transporter.sendMail({
    from: `QuizFlow <${emailAddress}>`,
    to,
    subject,
    html,
    text,
    replyTo,
  })
}

export default { sendEmail }
