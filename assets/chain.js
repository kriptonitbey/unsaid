/* Unsaid: read-only access to the contract on BNB Chain through public RPCs.
   Never touches the visitor's wallet. */
const UNSAID = {
  contract: "0xF75c454aB8E984f65528f44D3cAcA702481B2209",
  deployBlock: 130086577,
  explorer: "https://bscscan.com",
  rpcs: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.bnbchain.org", "https://bsc-dataseed1.defibit.io", "https://1rpc.io/bnb"],
  TRANSFER: "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
  ZERO_TOPIC: "0x0000000000000000000000000000000000000000000000000000000000000000"
};

let _rpcIndex = 0;
async function rpc(method, params) {
  let lastErr;
  for (let k = 0; k < UNSAID.rpcs.length; k++) {
    const i = (_rpcIndex + k) % UNSAID.rpcs.length;
    try {
      const res = await fetch(UNSAID.rpcs[i], {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error.message || "rpc error");
      _rpcIndex = i;
      return j.result;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("No RPC reachable");
}

/* many calls at once; falls back to small parallel groups if the node refuses batches */
async function rpcMany(reqs) {
  const url = UNSAID.rpcs[_rpcIndex];
  try {
    const res = await fetch(url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(reqs.map((r, id) => ({ jsonrpc: "2.0", id, method: r[0], params: r[1] })))
    });
    const j = await res.json();
    if (Array.isArray(j)) {
      const out = new Array(reqs.length);
      for (const r of j) out[r.id] = r.error ? null : r.result;
      if (out.every(x => x !== undefined)) return out;
    }
  } catch (e) { /* fall through */ }
  const out = [];
  for (let i = 0; i < reqs.length; i += 6) {
    const part = await Promise.all(reqs.slice(i, i + 6).map(r => rpc(r[0], r[1]).catch(() => null)));
    out.push(...part);
  }
  return out;
}

function ethCall(data) { return rpc("eth_call", [{ to: UNSAID.contract, data }, "latest"]); }
async function totalSupply() { return parseInt(await ethCall("0x18160ddd"), 16); }

/* owner of each token id; ids is an array of numbers */
async function owners(ids) {
  const out = {};
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const res = await rpcMany(chunk.map(id => ["eth_call", [{ to: UNSAID.contract, data: "0x6352211e" + id.toString(16).padStart(64, "0") }, "latest"]]));
    chunk.forEach((id, k) => { if (res[k]) out[id] = "0x" + res[k].slice(-40); });
  }
  return out;
}

/* most recent mints, newest first: walks back from the latest block in chunks until it has `limit` mints or reaches the deploy block */
async function recentMints(limit = 60, onProgress) {
  const latest = parseInt(await rpc("eth_blockNumber", []), 16);
  let to = latest, size = 5000, found = [], chunks = 0;
  while (to >= UNSAID.deployBlock && found.length < limit && chunks < 120) {
    const from = Math.max(UNSAID.deployBlock, to - size + 1);
    try {
      const logs = await rpc("eth_getLogs", [{
        address: UNSAID.contract, fromBlock: "0x" + from.toString(16), toBlock: "0x" + to.toString(16),
        topics: [UNSAID.TRANSFER, UNSAID.ZERO_TOPIC]
      }]);
      for (const l of logs.reverse()) {
        found.push({ id: parseInt(l.topics[3], 16), to: "0x" + l.topics[2].slice(-40), tx: l.transactionHash, block: parseInt(l.blockNumber, 16) });
      }
      to = from - 1; chunks++;
      if (onProgress) onProgress(found.length, (latest - to) / Math.max(1, latest - UNSAID.deployBlock));
    } catch (e) {
      if (size <= 250) throw e;
      size = Math.floor(size / 2);                       // the node wants a smaller range
    }
  }
  found.sort((a, b) => b.block - a.block || b.id - a.id);
  return { mints: found.slice(0, limit), complete: to < UNSAID.deployBlock, latest };
}

async function blockTimes(blocks) {
  const uniq = [...new Set(blocks)];
  const res = await rpcMany(uniq.map(b => ["eth_getBlockByNumber", ["0x" + b.toString(16), false]]));
  const out = {};
  uniq.forEach((b, i) => { if (res[i]) out[b] = parseInt(res[i].timestamp, 16) * 1000; });
  return out;
}

function shortAddr(a) { return a.slice(0, 6) + "…" + a.slice(-4); }
function ago(ms) {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return s + "s ago";
  const m = Math.round(s / 60); if (m < 60) return m + "m ago";
  const h = Math.round(m / 60); if (h < 48) return h + "h ago";
  return Math.round(h / 24) + "d ago";
}
let _pieces = null;
async function pieces() {
  if (!_pieces) _pieces = fetch("data/pieces.json").then(r => r.json());
  return _pieces;                                            // [id, sentence, mood, certainty, ghosts, length, words]
}
function pad4(n) { return String(n).padStart(4, "0"); }
