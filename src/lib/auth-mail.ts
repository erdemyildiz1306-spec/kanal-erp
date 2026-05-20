/** Şifre sıfırlama e-postası — Resend API veya geliştirme konsolu */

function appBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//i, '')}`;
  return 'http://127.0.0.1:3005';
}

export function buildPasswordResetUrl(token: string): string {
  const base = appBaseUrl();
  return `${base}/login?resetToken=${encodeURIComponent(token)}`;
}

export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string
): Promise<{ sent: boolean; devPreview?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim() || 'Kanal ERP <onboarding@resend.dev>';

  if (apiKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: 'Kanal ERP — Şifre sıfırlama',
        html: `
          <p>Merhaba,</p>
          <p>Kanal ERP hesabınız için şifre sıfırlama talebi aldık.</p>
          <p><a href="${resetUrl}">Şifrenizi sıfırlamak için tıklayın</a></p>
          <p>Bu bağlantı 1 saat geçerlidir. Talebi siz yapmadıysanız bu e-postayı yok sayın.</p>
        `,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`E-posta gönderilemedi: ${text.slice(0, 200)}`);
    }
    return { sent: true };
  }

  if (process.env.NODE_ENV !== 'production') {
    console.info('[auth] Şifre sıfırlama bağlantısı (geliştirme):', resetUrl);
    return { sent: false, devPreview: resetUrl };
  }

  return { sent: false };
}
