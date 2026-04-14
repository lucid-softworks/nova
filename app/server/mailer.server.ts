import { Resend } from 'resend'

export type SendEmailInput = {
  to: string | string[]
  subject: string
  html: string
  text?: string
  from?: string
}

let _resend: Resend | null = null
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  if (!_resend) _resend = new Resend(key)
  return _resend
}

function defaultFrom(): string {
  return process.env.RESEND_FROM ?? 'SocialHub <onboarding@resend.dev>'
}

/**
 * Send an email via Resend. When RESEND_API_KEY isn't set (e.g. dev), logs
 * the payload to the console and returns a synthetic ok result so callers
 * can stay oblivious.
 */
export async function sendEmail(input: SendEmailInput): Promise<{ ok: true; id: string | null }> {
  const client = getResend()
  if (!client) {
    console.log(
      `[mailer:dev]`,
      JSON.stringify({
        to: input.to,
        subject: input.subject,
        text: input.text ?? undefined,
        htmlPreview: input.html.slice(0, 400),
      }),
    )
    return { ok: true, id: null }
  }
  const from = input.from ?? defaultFrom()
  const res = await client.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    ...(input.text ? { text: input.text } : {}),
  })
  if (res.error) {
    throw new Error(`Email send failed: ${res.error.message}`)
  }
  return { ok: true, id: res.data?.id ?? null }
}
