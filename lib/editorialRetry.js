// Count only database-confirmed effects. Sending a verified row is not proof
// of publication: constraints, concurrent writers, and network failures matter.
export async function persistEditorialRetry({ endpoint, headers, row, fetchImpl = fetch }) {
  try {
    const r = await fetchImpl(endpoint, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ p_row: row }), cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!r.ok) return { ok: false, error: `retry update http ${r.status}`, updated: 0, published: 0 };
    const data = await r.json();
    if (![0,1].includes(data?.updated) || ![0,1].includes(data?.published) || data.published > data.updated || (data.published === 1 && row.verified !== true)) {
      return { ok: false, error: 'retry update returned invalid counters', updated: 0, published: 0 };
    }
    return { ok: true, updated: data.updated, published: data.published };
  } catch { return { ok: false, error: 'retry update unavailable', updated: 0, published: 0 }; }
}
