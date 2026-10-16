import { useState } from 'react';

export default function PhoneImage({ phone, className = '', compact = false }) {
  const [failedUrl, setFailedUrl] = useState(null);
  const url = phone?.image_url;
  return url && failedUrl !== url ? (
    <img src={url} alt={phone.model} className={`object-contain ${className}`} onError={() => setFailedUrl(url)} />
  ) : (
    <div role="img" aria-label={phone ? `Image unavailable for ${phone.model}` : 'No phone selected'}
      className={`flex flex-col items-center justify-center gap-2 rounded-xl bg-slate-800/60 text-slate-400 ${className}`}>
      <span aria-hidden="true" className="text-2xl">▯</span>
      {!compact && <span className="text-xs text-center px-2">{phone ? 'Image unavailable' : 'Select a model'}</span>}
    </div>
  );
}
