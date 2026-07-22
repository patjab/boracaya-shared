import * as React from 'react';

/**
 * The fresh-event wait cadence (#878): re-poll the caller's reload on a short
 * interval and hand over the screen the moment the config lands; only after
 * the cap does the notice ask the host to act.
 */
export const useSetupPolling = ({ reload, maxAttempts, intervalMs }: {
  reload: () => void | Promise<unknown>;
  maxAttempts: number;
  intervalMs: number;
}) => {
  const [attempts, setAttempts] = React.useState(0);
  const exhausted = attempts >= maxAttempts;

  React.useEffect(() => {
    if (exhausted) return undefined;
    const t = setTimeout(() => {
      setAttempts((a) => a + 1);
      void reload();
    }, intervalMs);
    return () => clearTimeout(t);
  }, [attempts, exhausted, intervalMs, reload]);

  const checkAgain = () => {
    setAttempts(0);
    void reload();
  };

  return { exhausted, checkAgain };
};
