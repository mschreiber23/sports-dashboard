import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const PHONE = '(hover: none) and (pointer: coarse)';

/* The page scroller is .app-body. iOS draws its indicator inset from the
   glass, on top of the cards. This thumb is fixed to the screen edge. */
export default function EdgeScrollbar() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    const scroller = document.querySelector('.app-body');
    if (!el || !scroller) return undefined;

    const mq = window.matchMedia(PHONE);
    let timer = 0;
    let frame = 0;

    const place = () => {
      frame = 0;
      if (!mq.matches) {
        el.classList.remove('is-on');
        return;
      }
      const { scrollTop, scrollHeight, clientHeight } = scroller;
      const track = scroller.getBoundingClientRect();
      if (scrollHeight <= clientHeight + 1 || track.height < 1) {
        el.classList.remove('is-on');
        return;
      }
      const thumbH = Math.max(36, (clientHeight / scrollHeight) * track.height);
      const maxTop = Math.max(0, track.height - thumbH);
      const span = scrollHeight - clientHeight;
      const top = track.top + (span > 0 ? (scrollTop / span) * maxTop : 0);
      el.style.top = `${top}px`;
      el.style.height = `${thumbH}px`;
      el.classList.add('is-on');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => el.classList.remove('is-on'), 800);
    };

    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(place);
    };

    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    mq.addEventListener?.('change', onScroll);

    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      mq.removeEventListener?.('change', onScroll);
      window.clearTimeout(timer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return createPortal(
    <div ref={ref} className="edge-scrollbar" aria-hidden="true" />,
    document.body,
  );
}
