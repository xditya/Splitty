// PLAN.md §4.5 — the geometric layout parser is pure; test it without WASM.
import { describe, expect, it } from 'vitest'
import { groupLines, parseWords, type Word } from './parser'

// helper: lay words on synthetic receipt lines (y per line, price right-aligned)
function line(y: number, tokens: [string, number, number][]): Word[] {
  return tokens.map(([text, x0, x1]) => ({ text, x0, x1, y0: y, y1: y + 20 }))
}

const RECEIPT: Word[] = [
  ...line(10, [
    ['2', 10, 20],
    ['Butter', 30, 90],
    ['Chicken', 95, 160],
    ['560.00', 240, 300],
  ]),
  ...line(40, [
    ['Garlic', 30, 80],
    ['Naan', 85, 130],
    ['90.00', 246, 300],
  ]),
  ...line(70, [
    ['Kingfisher', 30, 120],
    ['Beer', 125, 160],
    ['250.00', 242, 300],
  ]),
  ...line(100, [
    ['Subtotal', 30, 110],
    ['900.00', 240, 300],
  ]),
  ...line(130, [
    ['CGST', 30, 80],
    ['2.5%', 85, 120],
    ['22.50', 248, 300],
  ]),
  ...line(160, [
    ['Total', 30, 80],
    ['945.00', 240, 300],
  ]),
]

describe('groupLines (§4.5.1)', () => {
  it('clusters words into rows by y-centre', () => {
    const lines = groupLines(RECEIPT)
    expect(lines).toHaveLength(6)
    expect(lines[0].map((w) => w.text)).toEqual(['2', 'Butter', 'Chicken', '560.00'])
  })
})

describe('parseWords (§4.5)', () => {
  const result = parseWords(RECEIPT)

  it('extracts items with qty, name, paise line_total; anchors terminate the list', () => {
    expect(result.items).toHaveLength(3)
    expect(result.items[0]).toMatchObject({ name: 'Butter Chicken', qty: 2, lineTotal: 56000 })
    expect(result.items[1]).toMatchObject({ name: 'Garlic Naan', qty: 1, lineTotal: 9000 })
  })

  it('classifies obvious alcohol', () => {
    expect(result.items[2].category).toBe('alcohol')
  })

  it('captures anchor rows as charges/subtotal/total', () => {
    expect(result.subtotal).toBe(90000)
    expect(result.total).toBe(94500)
    expect(result.charges).toHaveLength(1)
    expect(result.charges[0]).toMatchObject({ kind: 'gst', amount: 2250 })
  })

  it('flags prices outside the price column as low confidence (§4.5.5)', () => {
    const noisy: Word[] = [
      ...RECEIPT,
      ...line(85, [
        ['Odd', 30, 60],
        ['Row', 65, 95],
        ['12.00', 130, 170], // way left of the price rail
      ]),
    ]
    const r = parseWords(noisy)
    const odd = r.items.find((i) => i.name === 'Odd Row')
    expect(odd?.confidence).toBe('low')
  })

  it('is tagged as the tesseract engine', () => {
    expect(result.engine).toBe('tesseract')
  })
})
