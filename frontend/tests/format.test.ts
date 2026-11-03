import { describe, expect, it } from 'vitest'
import { dateTime } from '../src/lib/format'

describe('UTC order dates', () => {
  it.each([
    '2026-01-01T18:00:00.000Z',
    '2026-01-01T23:59:59.999Z',
    '2026-01-02T00:00:00.000Z',
  ])('formats %s in the UTC day used by history filters', (timestamp) => {
    const expected = new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC',
    }).format(new Date(timestamp))
    expect(dateTime(timestamp)).toBe(`${expected} UTC`)
  })
})
