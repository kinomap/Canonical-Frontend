import { describe, expect, it } from 'vitest'
import { formatBudget, formatClock, formatDate, formatSeconds, formatSize, plural } from '@/utils/ruFormat'

describe('Russian title page wording', () => {
  it('declines counts', () => {
    const seeds = (n: number) => `${n} ${plural(n, 'сид', 'сида', 'сидов')}`
    expect([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111, 173].map(seeds)).toEqual([
      '1 сид', '2 сида', '4 сида', '5 сидов', '11 сидов', '12 сидов', '14 сидов', '21 сид', '22 сида', '25 сидов', '101 сид', '111 сидов', '173 сида',
    ])
    expect(plural(0, 'серия', 'серии', 'серий')).toBe('серий')
    expect(plural(176, 'серия', 'серии', 'серий')).toBe('серий')
  })
  it('formats sizes and start latency with a decimal comma', () => {
    expect(formatSize(76_666_000_000)).toBe('71,4 ГБ')
    expect(formatSize(1_468_006_400)).toBe('1,4 ГБ')
    expect(formatSize(512 * 1048576)).toBe('512 МБ')
    expect(formatSize(1000)).toBe('1 МБ')
    expect([0, -1, NaN, null, undefined].map((v) => formatSize(v as number))).toEqual(['', '', '', '', ''])
    expect(formatSeconds(3140)).toBe('3,1 с')
    expect(formatSeconds(18416)).toBe('18,4 с')
    expect(formatSeconds(2000)).toBe('2 с')
    expect(formatSeconds(0)).toBe('0 с')
    expect([null, -5, Infinity].map((v) => formatSeconds(v as number))).toEqual(['', '', ''])
  })
  it('words the title page chips: release date, budget and film length', () => {
    expect(formatDate('2005-09-19')).toBe('19.09.2005')
    expect(['2005', '2005-13-01', '2023-02-29', '', null, undefined].map((v) => formatDate(v as string))).toEqual(['', '', '', '', '', ''])
    expect([120_000_000, 185_000_000, 1_250_000_000, 2_500_000, 950_000, 500].map(formatBudget)).toEqual(['$120M', '$185M', '$1.3B', '$2.5M', '$950K', '$500'])
    expect([0, -1, 2.5, NaN, null].map((v) => formatBudget(v as number))).toEqual(['', '', '', '', ''])
    expect([92, 152, 45, 600].map(formatClock)).toEqual(['01:32', '02:32', '00:45', '10:00'])
    expect([0, -3, 1.5, null].map((v) => formatClock(v as number))).toEqual(['', '', '', ''])
  })
})
