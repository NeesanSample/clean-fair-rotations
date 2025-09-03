import { useEffect, useRef } from 'react';
import { supabaseKeepAlive } from '@/integrations/supabase/keep-alive';

interface UseKeepAliveOptions {
  /** How often to ping in minutes (default: 60) */
  intervalMinutes?: number;
  /** Whether to auto-start when component mounts (default: true) */
  autoStart?: boolean;
  /** Whether to stop when component unmounts (default: true) */
  autoStop?: boolean;
}

/**
 * React hook for managing Supabase keep-alive functionality
 * Automatically starts/stops keep-alive based on component lifecycle
 */
export function useKeepAlive(options: UseKeepAliveOptions = {}) {
  const {
    intervalMinutes = 60,
    autoStart = true,
    autoStop = true
  } = options;

  const hasStarted = useRef(false);

  useEffect(() => {
    if (autoStart && !hasStarted.current) {
      supabaseKeepAlive.start(intervalMinutes);
      hasStarted.current = true;
    }

    return () => {
      if (autoStop && hasStarted.current) {
        supabaseKeepAlive.stop();
        hasStarted.current = false;
      }
    };
  }, [autoStart, autoStop, intervalMinutes]);

  return {
    start: () => supabaseKeepAlive.start(intervalMinutes),
    stop: () => supabaseKeepAlive.stop(),
    isRunning: supabaseKeepAlive.isRunning
  };
}
