import { sendEmail } from './clients/email.client'
import { ContactMessageInput } from '../validators/contact.schema'

// Where contact-form submissions are delivered. Overridable via env so the
// destination isn't hard-coded to one inbox in other environments.
const receiver = process.env.CONTACT_RECEIVER_EMAIL ?? 'javohirmirzakhalov@gmail.com'

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

export const sendContactMessage = async ({ name, email, message }: ContactMessageInput) => {
  const safeName = escapeHtml(name)
  const safeEmail = escapeHtml(email)
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br />')

  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 560px; margin: 0 auto;">
      <h2 style="margin: 0 0 16px;">New contact message</h2>
      <p style="margin: 0 0 4px;"><strong>From:</strong> ${safeName}</p>
      <p style="margin: 0 0 16px;"><strong>Email:</strong> ${safeEmail}</p>
      <div style="background: #f4f4f5; border-radius: 8px; padding: 16px; white-space: pre-wrap;">
        ${safeMessage}
      </div>
    </div>
  `

  const text = `New contact message\n\nFrom: ${name}\nEmail: ${email}\n\n${message}`

  await sendEmail({
    to: receiver,
    subject: `New contact message from ${name}`,
    html,
    text,
    // Reply goes straight to the visitor, not the platform inbox.
    replyTo: email,
  })
}
