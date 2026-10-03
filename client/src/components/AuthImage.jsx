import { useEffect, useState } from 'react';
import { getToken } from '../lib/api.js';

/**
 * <img> for API-protected photos. Fetches with the bearer token and shows an object URL.
 * `token` defaults to the office token; the driver page passes its own.
 */
export function AuthImage({ src, alt, token, style, ...rest }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    let objectUrl = null;
    fetch(src, { headers: { Authorization: `Bearer ${token ?? getToken()}` }, signal: ctrl.signal })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((blob) => { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); })
      .catch((err) => { if (err.name !== 'AbortError') setFailed(true); });
    return () => {
      ctrl.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src, token]);

  if (failed) return <div className="t-muted" style={{ ...style, display: 'grid', placeItems: 'center', fontSize: 12 }}>Bild saknas</div>;
  if (!url) return <div className="skeleton" style={style} aria-label="Laddar bild" />;
  return <img src={url} alt={alt} style={{ objectFit: 'cover', ...style }} {...rest} />;
}
