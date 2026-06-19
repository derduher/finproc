/**
 * tornadoNarrative — a one-line, data-driven lead for the sensitivity tornado.
 *
 * Pure: given the sensitivity rows (already sorted by descending impact, so
 * `data[0]` is the biggest lever), it returns a plain-language sentence naming
 * that lever and its success-rate swing in percentage points. WhatMoves renders
 * this above a static how-to-read key.
 */
import type { SensitivityResult } from '../../schema'

export interface TornadoNarrative {
  lead: string
}

export function tornadoNarrative(data: SensitivityResult[]): TornadoNarrative | null {
  const top = data[0]
  if (!top) return null

  const swingPp = Math.round(Math.max(Math.abs(top.loDelta), Math.abs(top.hiDelta)) * 100)
  if (swingPp < 1) {
    return {
      lead: 'No single lever moves your plan much — your success rate stays stable across these swings.',
    }
  }

  return {
    lead: `Your biggest lever is ${top.label} — nudging it ${top.sub} swings your success rate by up to ${swingPp} percentage points.`,
  }
}
