import { describe, expect, it } from 'vitest'
import { rows } from './review'
import { formatDate } from '../../../lib/domain'

describe('rows', () => {
  it('shows a full date in words and leaves other text as typed', () => {
    expect(rows([['Date', '2026-11-03']])).toEqual([['Date', formatDate('2026-11-03')]])
    expect(rows([['Date', '2026-11-3']])).toEqual([['Date', '2026-11-3']])
    expect(rows([['Note', 'near the church']])).toEqual([['Note', 'near the church']])
  })

  it('drops empty answers', () => {
    expect(rows([['Name', ''], ['Phone', null], ['Email', undefined], ['Age', 0]])).toEqual([['Age', '0']])
  })
})
