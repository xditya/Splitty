// Unit-share display helpers. shares[personId] holds UNITS consumed — integers
// for whole units, fractions (1/2, 1/3…) when a club shared a unit.

export function gcdInt(a: number, b: number): number {
  return b === 0 ? a : gcdInt(b, a % b)
}

/** '' for exactly 1 unit; '×2' for whole; '1/2', '3/2' for fractional. */
export function unitsLabel(n: number): string {
  if (Math.abs(n - Math.round(n)) < 0.01) {
    const w = Math.round(n)
    return w === 1 ? '' : `×${w}`
  }
  for (let q = 2; q <= 12; q++) {
    const p = Math.round(n * q)
    if (p > 0 && Math.abs(n - p / q) < 0.01) {
      const g = gcdInt(p, q)
      return `${p / g}/${q / g}`
    }
  }
  return `×${n.toFixed(2)}`
}

/** Total units assigned on an item (sum of shares, float-tolerant). */
export function unitsUsed(shares: Record<string, number>): number {
  let s = 0
  for (const v of Object.values(shares)) s += v
  return s
}

/** Fully assigned = every unit accounted for (within float tolerance). */
export function fullyAssigned(shares: Record<string, number>, qty: number): boolean {
  return unitsUsed(shares) >= Math.max(1, qty) - 0.02
}
