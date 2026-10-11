export function canonical(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object')
    return (
      '{' +
      Object.entries(v)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, x]) => JSON.stringify(k) + ':' + canonical(x))
        .join(',') +
      '}'
    );
  return JSON.stringify(v) ?? 'null';
}
// Synchronous SHA-256 for stable preview/receipt fingerprints, without Node APIs.
export function hash(value: unknown): string {
  const bytes = new TextEncoder().encode(canonical(value));
  const size = Math.ceil((bytes.length + 9) / 64) * 64,
    buffer = new Uint8Array(size);
  buffer.set(bytes);
  buffer[bytes.length] = 128;
  const view = new DataView(buffer.buffer);
  view.setUint32(size - 4, bytes.length * 8);
  const k: number[] = [],
    initial: number[] = [];
  for (let n = 2; k.length < 64; n++) {
    let prime = true;
    for (let d = 2; d * d <= n; d++)
      if (n % d === 0) {
        prime = false;
        break;
      }
    if (prime) {
      if (initial.length < 8) initial.push(((Math.sqrt(n) % 1) * 2 ** 32) | 0);
      k.push(((Math.cbrt(n) % 1) * 2 ** 32) | 0);
    }
  }
  const h = initial,
    w = new Int32Array(64),
    rotr = (n: number, b: number) => (n >>> b) | (n << (32 - b));
  for (let offset = 0; offset < size; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getInt32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15]!,
        y = w[i - 2]!;
      w[i] =
        (w[i - 16]! +
          (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) +
          w[i - 7]! +
          (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10))) |
        0;
    }
    let [a, b, c, d, e, f, g, j] = h as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    for (let i = 0; i < 64; i++) {
      const t1 =
          (j +
            (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) +
            ((e & f) ^ (~e & g)) +
            k[i]! +
            w[i]!) |
          0,
        t2 =
          ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) +
            ((a & b) ^ (a & c) ^ (b & c))) |
          0;
      j = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, j].forEach((v, i) => (h[i] = (h[i]! + v) | 0));
  }
  return h.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
}
