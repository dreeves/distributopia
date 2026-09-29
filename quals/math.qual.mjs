// Quals for math.js, the DOM-free model. Run all quals with `npm run qual`.
// Each qual's name gives the replicata and expectata; a failure prints the resultata.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

// math.js is a classic browser script, so evaluate it in this realm and pull out its globals
vm.runInThisContext(fs.readFileSync(new URL('../math.js', import.meta.url), 'utf8'))
const { check, poly, cum, areaD, cdfD, add, remove, move, nearest, trail, sketch, PRESETS } =
  vm.runInThisContext('({ check, poly, cum, areaD, cdfD, add, remove, move, nearest, trail, sketch, PRESETS })')

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`)

// Evaluate the cdf path from cdfD at u, treating each Q segment as the quadratic Bézier it is
function bezierAt(d, u) {
  const [, ...segs] = d.split('Q')
  let [u0, F0] = [0, 0]
  for (const s of segs) {
    const [cu, cF, u1, F1] = s.trim().split(/[ ,]+/).map(Number)
    const h = u1 - u0
    near(cu, u0 + h / 2)  // control point at the segment's midpoint u, so u is linear in t
    if (h > 0 && u0 <= u && u <= u1) {
      const t = (u - u0) / h
      return (1 - t) ** 2 * F0 + 2 * t * (1 - t) * cF + t ** 2 * F1
    }
    ;[u0, F0] = [u1, F1]
  }
  assert.fail(`u = ${u} is not covered by the cdf path`)
}

// Brute-force reference cdf: midpoint-rule integral of the linearly interpolated poly, with cells
// cut at every vertex so no cell straddles a jump (a vertical segment)
function bruteCdf(P, u, n = 1000) {
  const f = v => { const i = P.findLastIndex(p => p.u <= v); const [a, b] = [P[i], P[Math.min(i + 1, P.length - 1)]]
                   return b.u === a.u ? a.y : a.y + (b.y - a.y) * (v - a.u) / (b.u - a.u) }
  const cuts = hi => [...new Set([0, ...P.map(p => p.u).filter(v => v < hi), hi])]
  const piece = (lo, hi) => { let s = 0; for (let k = 0; k < n; k++) s += f(lo + (k + .5) * (hi - lo) / n); return s * (hi - lo) / n }
  const integral = hi => cuts(hi).slice(1).reduce((s, v, i) => s + piece(cuts(hi)[i], v), 0)
  return integral(u) / integral(1)
}

// A lumpy shape with a pt at u=0, a vertical segment at u=0.2, and a zero at u=0.9
const LUMPY = [{u: 0, y: .5}, {u: .2, y: 1}, {u: .2, y: .3}, {u: .6, y: .8}, {u: .9, y: 0}]

test('poly: pts get the fixed corners (0,0) and (1,0) around them', () => {
  assert.deepEqual(poly([{u: .5, y: 1}]), [{u: 0, y: 0}, {u: .5, y: 1}, {u: 1, y: 0}])
})

test('cum: a triangle peaking at (0.5, 1) → cumulative areas 0, 0.25, 0.5', () => {
  assert.deepEqual(cum(poly([{u: .5, y: 1}])), [0, .25, .5])
})

test('areaD: the triangle → a closed path through its vertices in unit coordinates', () => {
  assert.equal(areaD(poly([{u: .5, y: 1}])), 'M0,0L0.5,1L1,0Z')
})

test('cdfD: any shape with area → path from (0,0) to (1,1)', () => {
  const d = cdfD(poly(LUMPY))
  assert.ok(d.startsWith('M0,0'), d)
  assert.ok(d.endsWith(' 1,1'), d)
})

test('cdfD: lumpy shape → matches the brute-force integral everywhere, including mid-segment', () => {
  const d = cdfD(poly(LUMPY))
  for (const u of [0, .05, .1, .2, .33, .5, .6, .75, .9, .95, 1]) near(bezierAt(d, u), bruteCdf(poly(LUMPY), u), 1e-6)
})

test('cdfD: zero area (no pts, or all at height 0) → throws rather than drawing NaNs', () => {
  assert.throws(() => cdfD(poly([])))
  assert.throws(() => cdfD(poly([{u: .5, y: 0}])))
})

test('add: pt lands in u order; a tie with an existing u goes after it', () => {
  const a = {u: .2, y: .5}, b = {u: .6, y: .5}, c = {u: .4, y: .1}, d = {u: .6, y: .9}
  assert.deepEqual(add([a, b], c), [a, c, b])
  assert.deepEqual(add([a, b], d), [a, b, d])
})

test('add: pt outside the unit square (a click in the margin) → lands on the nearest edge', () => {
  assert.deepEqual(add([], {u: 1.3, y: -.2}), [{u: 1, y: 0}])
  assert.deepEqual(add([], {u: -.1, y: 1.5}), [{u: 0, y: 1}])
})

test('remove: drops the pt at the given index', () => {
  assert.deepEqual(remove([{u: .1, y: .1}, {u: .2, y: .2}, {u: .3, y: .3}], 1), [{u: .1, y: .1}, {u: .3, y: .3}])
})

test('move: stays between its neighbors in u and within 0..1 in y', () => {
  const pts = [{u: .2, y: .5}, {u: .5, y: .5}, {u: .8, y: .5}]
  assert.deepEqual(move(pts, 1, {u: .95, y: 1.4}), [{u: .2, y: .5}, {u: .8, y: 1}, {u: .8, y: .5}])
  assert.deepEqual(move(pts, 1, {u: .1, y: -1}), [{u: .2, y: .5}, {u: .2, y: 0}, {u: .8, y: .5}])
  assert.deepEqual(move(pts, 0, {u: -.3, y: .7}), [{u: 0, y: .7}, {u: .5, y: .5}, {u: .8, y: .5}])
  assert.deepEqual(move(pts, 2, {u: 1.3, y: .7}), [{u: .2, y: .5}, {u: .5, y: .5}, {u: 1, y: .7}])
})

test('add/remove/move: leave their input array untouched (undo history relies on that)', () => {
  const pts = [{u: .2, y: .5}, {u: .5, y: .5}], copy = structuredClone(pts)
  add(pts, {u: .3, y: .3}); remove(pts, 0); move(pts, 1, {u: .9, y: .9})
  assert.deepEqual(pts, copy)
})

test('nearest: closest screen position within the radius → its index; nothing within → -1', () => {
  const xys = [[100, 100], [120, 100], [300, 50]]
  assert.equal(nearest(xys, 108, 100, 20), 0)
  assert.equal(nearest(xys, 112, 100, 20), 1)
  assert.equal(nearest(xys, 300, 71, 20), -1)
  assert.equal(nearest([], 0, 0, 20), -1)
})

test('check: unsorted, out-of-bounds, or NaN pts → throws', () => {
  assert.throws(() => check([{u: .5, y: .5}, {u: .4, y: .5}]))
  assert.throws(() => check([{u: .5, y: 1.1}]))
  assert.throws(() => check([{u: NaN, y: .5}]))
  assert.deepEqual(check(LUMPY), LUMPY)
})

test('PRESETS: every preset is valid pts with a peak height of exactly 1', () => {
  assert.deepEqual(Object.keys(PRESETS), ['normal', 'uniform', 'exponential', 'triangular', 'beta', 'lognormal', 'bimodal'])
  for (const [name, pts] of Object.entries(PRESETS)) {
    check(pts)
    assert.equal(Math.max(...pts.map(p => p.y)), 1, name)
  }
})

test('PRESETS: same pt counts and even u spacing as the original generators', () => {
  const counts = {normal: 18, uniform: 2, exponential: 10, triangular: 3, beta: 10, lognormal: 10, bimodal: 10}
  for (const [name, pts] of Object.entries(PRESETS)) {
    assert.equal(pts.length, counts[name], name)
    const u0 = name === 'lognormal' ? .01 : 0
    pts.forEach((p, i) => near(p.u, u0 + i / (pts.length - 1) * (1 - u0)))
  }
})

test('PRESETS: shapes match the original generators', () => {
  const ys = name => PRESETS[name].map(p => p.y)
  const symmetric = a => a.forEach((y, i) => near(y, a[a.length - 1 - i], 1e-12))
  const argmax = a => a.indexOf(Math.max(...a))
  assert.deepEqual(PRESETS.triangular, [{u: 0, y: 0}, {u: .5, y: 1}, {u: 1, y: 0}])
  assert.deepEqual(ys('uniform'), [1, 1])
  symmetric(ys('normal')); near(ys('normal')[0], Math.exp(-4.5 + 4.5 / 289), 1e-12)  // e^-4.5 over the grid peak at 8/17
  ys('exponential').forEach((y, i) => near(y, Math.exp(-5 * i / 9), 1e-12))
  assert.equal(argmax(ys('beta')), 2)                 // beta(2,5) has its mode at 0.2; nearest grid pt is 2/9
  assert.equal(argmax(ys('lognormal')), 7)            // mode e^-0.25 ≈ 0.779; nearest grid pt is 0.78
  symmetric(ys('bimodal')); assert.deepEqual([3, 6].map(i => ys('bimodal')[i] > ys('bimodal')[4]), [true, true])
})

// Assert pts match want, u and y each within 1e-9
function assertPts(got, want) {
  const ok = got.length === want.length && got.every((p, i) => Math.abs(p.u - want[i].u) < 1e-9 && Math.abs(p.y - want[i].y) < 1e-9)
  assert.ok(ok, `got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

test('add: several pts at once → all land in u order', () => {
  assert.deepEqual(add([{u: .5, y: .5}], {u: .7, y: .1}, {u: .2, y: .9}), [{u: .2, y: .9}, {u: .5, y: .5}, {u: .7, y: .1}])
})

// trail's third argument is the plot's height over its width, so distances come out as they look on
// screen. These quals mostly use .5, a plot twice as wide as it is tall.

test('trail: press without moving → one dot at the press', () => {
  assertPts(trail([{u: .3, y: .4}], .05, .5), [{u: .3, y: .4}])
})

test('trail: drag 12% right → dots at the press, +5%, +10%', () => {
  assertPts(trail([{u: .3, y: .4}, {u: .42, y: .4}], .05, .5), [.3, .35, .4].map(u => ({u, y: .4})))
})

test('trail: drag left → dots at −5%, −10%, in u order', () => {
  assertPts(trail([{u: .5, y: .5}, {u: .39, y: .5}], .05, .5), [.4, .45, .5].map(u => ({u, y: .5})))
})

test('trail: drag straight up → dots as far apart on screen as horizontally (on a 2:1 plot, every .1 of height)', () => {
  assertPts(trail([{u: .5, y: .1}, {u: .5, y: .5}], .05, .5), [.1, .2, .3, .4, .5].map(y => ({u: .5, y})))
})

test('trail: diagonal drag → a dot every step of on-screen distance along it', () => {
  // (0,0) to (.3,.8) on a 2:1 plot is .3 wide and .4 tall in width units: length .5, so 10 steps
  assertPts(trail([{u: 0, y: 0}, {u: .3, y: .8}], .05, .5), Array.from({length: 11}, (_, m) => ({u: .03 * m, y: .08 * m})))
})

test('trail: out and back over the same stretch → breadcrumbs from both passes all stay', () => {
  // out .1 along y = .5, then back from (.4, .5) to (.3, .7), which is .1 wide and .1 tall on screen
  const t = [.05, .1].map(s => s / Math.hypot(.1, .1))  // fraction of the way back at path length .15 and .2
  assertPts(trail([{u: .3, y: .5}, {u: .4, y: .5}, {u: .3, y: .7}], .05, .5),
            [{u: .3, y: .5}, {u: .4 - .1 * t[1], y: .5 + .2 * t[1]}, {u: .35, y: .5}, {u: .4 - .1 * t[0], y: .5 + .2 * t[0]}, {u: .4, y: .5}])
})

test('trail: fast drag sampled once or slow drag sampled 100 times → same dots', () => {
  const [a, b] = [{u: .1, y: .2}, {u: .8, y: .6}]
  const slow = Array.from({length: 101}, (_, i) => ({u: a.u + (b.u - a.u) * i / 100, y: a.y + (b.y - a.y) * i / 100}))
  assertPts(trail(slow, .05, .5), trail([a, b], .05, .5))
})

test('trail: pointer beyond the plot → path clamped to the unit square', () => {
  assertPts(trail([{u: .88, y: .5}, {u: 1.3, y: .5}], .05, .5), [.88, .93, .98].map(u => ({u, y: .5})))
})

test('trail: any wiggly path → valid pts', () => {
  check(trail([.5, .61, .44, .7, .33, .9, .12, .95].map((u, i) => ({u, y: (i % 3) / 2})), .05, .5))
})

test('sketch: drag across existing pts → its dots replace those strictly inside the stretch of u it covered', () => {
  const pts = [{u: .1, y: .5}, {u: .35, y: .9}, {u: .4, y: .9}, {u: .6, y: .5}]
  assertPts(sketch(pts, [{u: .3, y: .2}, {u: .5, y: .2}], .05, .5),
            [{u: .1, y: .5}, ...[.3, .35, .4, .45, .5].map(u => ({u, y: .2})), {u: .6, y: .5}])
})

test('sketch: a tap covers no stretch → replaces nothing, not even a pt at the very same u', () => {
  assertPts(sketch([{u: .5, y: .9}], [{u: .5, y: .2}], .05, .5), [{u: .5, y: .9}, {u: .5, y: .2}])
})

test('sketch: out to .6 and back to .4 → the whole stretch reached, .3 to .6, counts', () => {
  const got = sketch([{u: .55, y: .9}, {u: .65, y: .9}], [{u: .3, y: .1}, {u: .6, y: .1}, {u: .4, y: .1}], .05, .5)
  assert.deepEqual(got.filter(p => p.y === .9), [{u: .65, y: .9}])
})

test('sketch: drag beyond the plot → covered stretch clamped to the unit square', () => {
  const got = sketch([{u: .95, y: .9}], [{u: .8, y: .1}, {u: 1.3, y: .1}], .05, .5)
  assert.ok(got.every(p => p.y !== .9), JSON.stringify(got))
})
