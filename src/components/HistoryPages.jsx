import { useLayoutEffect, useMemo, useRef } from 'react';
import { Routes, UNSAFE_LocationContext, useLocation, useNavigationType } from 'react-router-dom';
import { rememberHistory } from '../utils/historyStack';

function HistoryFrame({ page, active, navType, children }) {
  const ref = useRef(null);
  const scrollRef = useRef(0);
  const locationContext = useMemo(
    () => ({ location: page, navigationType: navType }),
    [page, navType],
  );

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !active) return undefined;
    el.scrollTop = scrollRef.current;
    const onScroll = () => { scrollRef.current = el.scrollTop; };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scrollRef.current = el.scrollTop || scrollRef.current;
      el.removeEventListener('scroll', onScroll);
    };
  }, [active]);

  return (
    <div ref={ref} className="app-page" hidden={!active} inert={!active}>
      <UNSAFE_LocationContext.Provider value={locationContext}>
        {children}
      </UNSAFE_LocationContext.Provider>
    </div>
  );
}

export default function HistoryPages({ render }) {
  const location = useLocation();
  const navType = useNavigationType();
  const stackRef = useRef(null);
  if (!stackRef.current || stackRef.current.key !== location.key) {
    stackRef.current = rememberHistory(stackRef.current, location, navType);
  }
  const { pages } = stackRef.current;

  return pages.map((page) => (
    <HistoryFrame
      key={page.key}
      page={page}
      active={page.key === location.key}
      navType={page.key === location.key ? navType : 'POP'}
    >
      <Routes location={page}>{render()}</Routes>
    </HistoryFrame>
  ));
}
