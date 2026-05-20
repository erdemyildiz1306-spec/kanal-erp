/** Capacitor APK içinde kamera iznini Android seviyesinde ister (WebView getUserMedia öncesi). */
export async function ensureNativeCameraPermission(): Promise<void> {
  if (typeof window === 'undefined') return;

  const cap = (
    window as unknown as {
      Capacitor?: { isNativePlatform?: () => boolean };
    }
  ).Capacitor;

  if (!cap?.isNativePlatform?.()) return;

  try {
    const { Camera } = await import('@capacitor/camera');
    let perm = await Camera.checkPermissions();

    if (perm.camera === 'granted') return;

    perm = await Camera.requestPermissions({ permissions: ['camera'] });

    if (perm.camera === 'granted') return;

    if (perm.camera === 'denied') {
      throw new Error(
        'Kamera izni reddedildi. Ayarlar → Uygulamalar → KanalERP → İzinler → Kamera bölümünden izin verin.'
      );
    }

    throw new Error('Kamera izni gerekli. Lütfen izin isteğine «İzin ver» deyin.');
  } catch (err) {
    if (err instanceof Error && err.message.includes('Kamera izni')) throw err;
    // Eski APK — eklenti yoksa tarayıcı/WebView kendi isteğini göstersin
    console.warn('Native camera permission plugin unavailable', err);
  }
}

export function mapCameraError(err: unknown): Error {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      return new Error(
        'Kamera izni verilmedi. Ayarlar → Uygulamalar → KanalERP → İzinler → Kamera bölümünden açın.'
      );
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      return new Error('Bu cihazda kullanılabilir kamera bulunamadı.');
    }
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      return new Error('Kamera başka bir uygulama tarafından kullanılıyor olabilir.');
    }
    if (err.name === 'SecurityError') {
      return new Error('Kamera güvenlik nedeniyle engellendi. Uygulamayı yeniden başlatın.');
    }
  }

  if (err instanceof Error) {
    if (/permission|izin|denied|not allowed/i.test(err.message)) {
      return new Error(
        'Kamera izni verilmedi. Ayarlar → Uygulamalar → KanalERP → İzinler → Kamera bölümünden açın.'
      );
    }
    return err;
  }

  return new Error('Kamera açılamadı. İzin verdiğinizden emin olun.');
}
