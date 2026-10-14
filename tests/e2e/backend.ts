// The search/provision/coverage tests need the real ULIS API with the sample corpus.
export async function backendAvailable(): Promise<boolean> {
  const base = (process.env.ULIS_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}
