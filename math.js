'use strict'
// The model: pure functions, no DOM. A classic script (not a module) so the page also works when
// opened as a file; script.js uses these globals. Quals: quals/math.qual.mjs.
//
// Vocabulary:
//   u     horizontal position as a fraction of the x-range: 0 at X-min, 1 at X-max
//   y     height of the drawn density, 0 to 1; only relative heights matter
//   pt    a vertex {u, y} of the drawn density, the kind the user adds, drags, and removes
//   pts   the array of all pts, sorted by u
//   poly  pts plus the fixed corners (0,0) and (1,0): the outline of the drawn density
//   cdf   cumulative distribution function: area under poly from 0 to u, over the total area

function assert(ok, msg) { if (!ok) throw new Error(`Assertion failed: ${msg}`) }

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

const poly = pts => [{u: 0, y: 0}, ...pts, {u: 1, y: 0}]

// Assert pts are sorted by u and inside the unit square (which also rules out NaNs); return pts
function check(pts) {
  const P = poly(pts)
  P.forEach(p => assert(0 <= p.u && p.u <= 1 && 0 <= p.y && p.y <= 1, `pt outside unit square: ${JSON.stringify(p)}`))
  P.slice(1).forEach((p, i) => assert(P[i].u <= p.u, `pts not sorted by u: ${JSON.stringify(pts)}`))
  return pts
}

// Cumulative area under poly at each of its vertices. Each segment is straight, so its area is
// exactly a trapezoid (zero for a vertical segment).
function cum(P) {
  const c = [0]
  for (let i = 1; i < P.length; i++) c.push(c[i - 1] + (P[i].u - P[i - 1].u) * (P[i].y + P[i - 1].y) / 2)
  return c
}

// SVG path data for the drawn density, in unit coordinates (u right, y up)
const areaD = P => 'M' + P.map(p => `${p.u},${p.y}`).join('L') + 'Z'

// SVG path data for the cdf, in unit coordinates. Over each straight segment of poly the cdf is
// a quadratic in u, which a quadratic Bézier draws exactly: control point at the segment's middle
// u, on the tangent line at the segment's start (whose slope is the density there).
function cdfD(P) {
  const c = cum(P), A = c.at(-1)
  assert(A > 0, 'the cdf of a density with zero area is undefined')
  let d = 'M0,0'
  for (let i = 1; i < P.length; i++) {
    const h = P[i].u - P[i - 1].u
    d += `Q${P[i - 1].u + h / 2},${(c[i - 1] + P[i - 1].y * h / 2) / A} ${P[i].u},${c[i] / A}`
  }
  return d
}

// pts plus q, kept inside the unit square; a stable sort puts q after any pt with the same u
const add = (pts, q) => [...pts, {u: clamp(q.u, 0, 1), y: clamp(q.y, 0, 1)}].sort((a, b) => a.u - b.u)

const remove = (pts, i) => pts.filter((_, j) => j !== i)

// pts with pts[i] moved to q, but no farther in u than its neighbors and no farther in y than 0..1
function move(pts, i, q) {
  const P = poly(pts)  // pts[i] is P[i+1], so its neighbors are P[i] and P[i+2]
  return pts.map((p, j) => j === i ? {u: clamp(q.u, P[i].u, P[i + 2].u), y: clamp(q.y, 0, 1)} : p)
}

// Index of the screen position in xys (an array of [x, y]) closest to (x, y) if it's within r,
// else -1. With xys empty, the min distance is Infinity, which indexOf doesn't find.
function nearest(xys, x, y, r) {
  const d = xys.map(([a, b]) => Math.hypot(a - x, b - y))
  const i = d.indexOf(Math.min(...d))
  return d[i] <= r ? i : -1
}

// Off-the-shelf shapes: n pts evenly spaced in u from u0 to 1, heights f(u) scaled to peak at 1.
// Formulas are the original x-range-relative generators with X-min = 0 and X-max = 1; constant
// factors like 1/(σ√(2π)) drop out in the scaling.
function sample(n, f, u0 = 0) {
  const us = Array.from({length: n}, (_, i) => u0 + i / (n - 1) * (1 - u0))
  const ys = us.map(f), top = Math.max(...ys)
  return us.map((u, i) => ({u, y: ys[i] / top}))
}

const PRESETS = {
  normal:      sample(18, u => Math.exp(-.5 * ((u - .5) * 6) ** 2)),            // σ = 1/6 of the range
  uniform:     sample(2, () => 1),
  exponential: sample(10, u => Math.exp(-5 * u)),                               // mean = 1/5 of the range
  triangular:  sample(3, u => 1 - Math.abs(2 * u - 1)),
  beta:        sample(10, u => u * (1 - u) ** 4),                               // α = 2, β = 5
  lognormal:   sample(10, u => Math.exp(-(Math.log(u) ** 2) / .5) / u, .01),    // μ = 0, σ = 0.5
  bimodal:     sample(10, u => Math.exp(-((u - .3) ** 2) / .02) + Math.exp(-((u - .7) ** 2) / .02)),
}
