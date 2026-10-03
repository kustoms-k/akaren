import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, ExternalLink } from 'lucide-react';
import { Button } from './Button.jsx';

/** Shows a driver link with copy, open and a QR code (handy when SMS is simulated). */
export function LinkShare({ url, note }) {
  const [qr, setQr] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 168, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(null));
  }, [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Kopiera länken:', url);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
      {qr && <img src={qr} alt="QR-kod för förarlänken" width={128} height={128} style={{ borderRadius: 8, border: '1px solid var(--border)' }} />}
      <div style={{ display: 'grid', gap: 8, minWidth: 0, flex: 1 }}>
        {note && <div style={{ fontSize: 13 }}>{note}</div>}
        <code className="num" style={{ fontSize: 12, wordBreak: 'break-all', background: 'var(--surface-elevated)', padding: '6px 8px', borderRadius: 6 }}>{url}</code>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button size="sm" variant="secondary" onClick={copy}><Copy size={13} /> {copied ? 'Kopierad' : 'Kopiera'}</Button>
          <Button size="sm" variant="ghost" onClick={() => window.open(url, '_blank', 'noopener')}><ExternalLink size={13} /> Öppna förarvyn</Button>
        </div>
      </div>
    </div>
  );
}
