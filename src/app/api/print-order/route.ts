import { NextResponse } from 'next/server'
import { Resend } from 'resend'

const FROM_EMAIL = 'amministrazione@studiob35.com'
const TO_EMAIL = 'servizioproxy@studiob35.com'

export async function POST(request: Request) {
  let body: {
    userName: string
    deckName: string
    decklist: string
    shareLink: string
    timestamp: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { userName, deckName, decklist, shareLink, timestamp } = body

  if (!userName || !deckName || !decklist || !shareLink || !timestamp) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const resendApiKey = process.env.RESEND_API_KEY
  if (!resendApiKey) {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
  }

  const resend = new Resend(resendApiKey)

  const requestedAt = new Date(timestamp).toLocaleString('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  try {
    await resend.emails.send({
      from: `Adunata <${FROM_EMAIL}>`,
      to: [TO_EMAIL],
      subject: `Print Order: ${deckName} — ${userName}`,
      html: `<html>
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
  <h2>Nuova richiesta stampa proxy</h2>
  <table style="border-collapse: collapse; width: 100%; margin-bottom: 24px;">
    <tr><td style="padding: 4px 12px 4px 0; font-weight: bold; width: 100px;">Utente</td><td>${escapeHtml(userName)}</td></tr>
    <tr><td style="padding: 4px 12px 4px 0; font-weight: bold;">Deck</td><td>${escapeHtml(deckName)}</td></tr>
    <tr><td style="padding: 4px 12px 4px 0; font-weight: bold;">Data</td><td>${requestedAt}</td></tr>
    <tr><td style="padding: 4px 12px 4px 0; font-weight: bold;">Link</td><td><a href="${escapeHtml(shareLink)}">${escapeHtml(shareLink)}</a></td></tr>
  </table>
  <h3>Decklist</h3>
  <pre style="background: #f5f5f5; padding: 16px; border-radius: 8px; font-size: 13px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(decklist)}</pre>
  <p style="color: #666; font-size: 12px; margin-top: 16px;">Link di condivisione deck incluso. Stampa disponibile tramite servizio proxy Adunata.</p>
</body>
</html>`,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[print-order]', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
