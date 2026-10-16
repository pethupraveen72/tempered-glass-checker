import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ title, onClose, children, wide = false }) {
  const titleId = useId();
  const panel = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => [...panel.current.querySelectorAll('button, [href], input, select, textarea, [tabindex="0"]')]
      .filter(element => !element.disabled && element.getClientRects().length);
    (panel.current.querySelector('[data-autofocus]') || focusable()[0] || panel.current).focus();
    const onKeyDown = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items.at(-1);
      if (!first) { event.preventDefault(); panel.current.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={`modal-panel ${wide ? 'modal-panel-wide' : ''}`}>
        <header className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 sm:px-6">
          <h2 id={titleId} className="text-lg font-bold text-white">{title}</h2>
          <button type="button" onClick={onClose} aria-label={`Close ${title}`} className="rounded-lg px-3 py-2 text-slate-300 hover:bg-white/10">✕</button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>, document.body
  );
}
