// Keeps an estimate of the server's clock so every phone shows the same timer.
let offset = 0;
let bestRtt = Infinity;

export function sampleServerTime(serverNow: number, sentAt: number, receivedAt: number) {
  const rtt = receivedAt - sentAt;
  // Prefer the fastest round trips, but let the estimate drift slowly over time.
  if (rtt <= bestRtt * 1.5 || bestRtt === Infinity) {
    bestRtt = Math.min(bestRtt * 1.02, rtt);
    offset = serverNow + rtt / 2 - receivedAt;
  }
}

export function serverNow(): number {
  return Date.now() + offset;
}
