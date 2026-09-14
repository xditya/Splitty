// §10.4 — the three settlement states, and the back-compat that lets them ship
// over splits that were created before claims existed.
import { describe, expect, it } from 'vitest'
import { settlePatch, settleState } from './settle'

describe('settleState', () => {
  it('treats the payer as settled — they are the one owed', () => {
    expect(settleState('me', 'me', {}, {})).toBe('confirmed')
    // …even while carrying a stray flag from an earlier payer
    expect(settleState('me', 'me', { me: false }, { me: true })).toBe('confirmed')
  })

  it('reads a bare paid flag as a full confirmation', () => {
    expect(settleState('p1', 'payer', { p1: true }, undefined)).toBe('confirmed')
  })

  it('reads a claim as claimed, not paid', () => {
    expect(settleState('p1', 'payer', {}, { p1: true })).toBe('claimed')
  })

  it('lets a confirmation outrank a claim that is still hanging around', () => {
    expect(settleState('p1', 'payer', { p1: true }, { p1: true })).toBe('confirmed')
  })

  it('is pending when nobody has said anything', () => {
    expect(settleState('p1', 'payer', {}, {})).toBe('pending')
    expect(settleState('p1', 'payer', { p1: false }, { p1: false })).toBe('pending')
  })

  it('survives splits stored before claims existed — no claimed map at all', () => {
    expect(settleState('p1', 'payer', { p1: true })).toBe('confirmed')
    expect(settleState('p1', 'payer', {})).toBe('pending')
    expect(settleState('p1', null, undefined, undefined)).toBe('pending')
  })
})

describe('settlePatch', () => {
  it('clears the claim a confirmation answers, so the two never both stand', () => {
    expect(settlePatch('confirmed')).toEqual({ paid: true, claimed: false })
  })

  it('claims without touching paid — only the payer may set that', () => {
    expect(settlePatch('claimed')).toEqual({ paid: false, claimed: true })
  })

  it('clears both on the way back to pending', () => {
    expect(settlePatch('pending')).toEqual({ paid: false, claimed: false })
  })

  it('round-trips: every state maps to flags that read back as itself', () => {
    for (const state of ['pending', 'claimed', 'confirmed'] as const) {
      const { paid, claimed } = settlePatch(state)
      expect(settleState('p1', 'payer', { p1: paid }, { p1: claimed })).toBe(state)
    }
  })
})
