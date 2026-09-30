import { useEffect, useRef, useState } from 'react';
import { msUntilNextSportsRollover, sameDay, sportsDayDate } from '../utils/sportsDay';

/**
 * Selected date for a "today" scores view.
 * Stays on the current sports slate and rolls forward at noon Eastern
 * while the user is still on that today view.
 */
export default function useSportsDaySelection() {
  const [sportsToday, setSportsToday] = useState(() => sportsDayDate());
  const [selectedDate, setSelectedState] = useState(() => sportsDayDate());
  const followRef = useRef(true);

  const setSelectedDate = (value) => {
    setSelectedState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      followRef.current = sameDay(next, sportsDayDate());
      return next;
    });
  };

  useEffect(() => {
    const sync = () => {
      const next = sportsDayDate();
      setSportsToday((prev) => (sameDay(prev, next) ? prev : next));
      if (followRef.current) {
        setSelectedState((prev) => (sameDay(prev, next) ? prev : next));
      } else {
        setSelectedState((prev) => {
          if (sameDay(prev, next)) followRef.current = true;
          return prev;
        });
      }
    };

    let timer;
    const arm = () => {
      timer = setTimeout(() => {
        sync();
        arm();
      }, msUntilNextSportsRollover());
    };
    arm();

    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', sync);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', sync);
    };
  }, []);

  return {
    selectedDate,
    setSelectedDate,
    sportsToday,
    isToday: sameDay(selectedDate, sportsToday),
  };
}
