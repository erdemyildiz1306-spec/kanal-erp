/**
 * FCM HTTP v1 — opsiyonel; env yoksa sessizce atlanır.
 * FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY (\\n escaped)
 */

import connectToDatabase from '@/lib/mongodb';
import FcmToken from '@/models/FcmToken';
import crypto from 'crypto';

function fcmConfigured(): boolean {
  return Boolean(
    process.env.FCM_PROJECT_ID?.trim() &&
      process.env.FCM_CLIENT_EMAIL?.trim() &&
      process.env.FCM_PRIVATE_KEY?.trim()
  );
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64url');
}

async function getFcmAccessToken(): Promise<string | null> {
  if (!fcmConfigured()) return null;
  const clientEmail = process.env.FCM_CLIENT_EMAIL!.trim();
  const privateKey = process.env.FCM_PRIVATE_KEY!.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const unsigned = `${header}.${claim}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  sign.end();
  const signature = sign.sign(privateKey);
  const jwt = `${unsigned}.${base64url(signature)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

export async function sendFcmToAllTokens(input: {
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<number> {
  if (!fcmConfigured()) return 0;
  await connectToDatabase();
  const tokens = await FcmToken.find({}).select('token').lean();
  if (!tokens.length) return 0;

  const accessToken = await getFcmAccessToken();
  if (!accessToken) return 0;

  const projectId = process.env.FCM_PROJECT_ID!.trim();
  let sent = 0;

  for (const row of tokens) {
    const token = String(row.token ?? '').trim();
    if (!token) continue;
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: input.title, body: input.body },
            data: input.data ?? {},
          },
        }),
      }
    );
    if (res.ok) sent++;
  }
  return sent;
}
