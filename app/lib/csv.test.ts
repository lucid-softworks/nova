import { describe, expect, it } from 'vitest'
import { parseCsv, toCsv } from './csv'

describe('parseCsv', () => {
  it('parses simple rows', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })

  it('parses quoted field containing a comma', () => {
    expect(parseCsv('a,"b,c",d')).toEqual([['a', 'b,c', 'd']])
  })

  it('parses escaped "" quote inside quoted field', () => {
    expect(parseCsv('a,"he said ""hi""",b')).toEqual([['a', 'he said "hi"', 'b']])
  })

  it('handles CRLF line endings same as LF', () => {
    expect(parseCsv('a,b\r\n1,2\r\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('strips UTF-8 BOM', () => {
    const bom = '\ufeff'
    expect(parseCsv(`${bom}a,b\n1,2`)).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('filters out empty trailing rows', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('toCsv', () => {
  it('does not over-quote simple fields', () => {
    expect(toCsv([['a', 'b'], ['1', '2']])).toBe('a,b\n1,2')
  })

  it('escapes fields containing commas', () => {
    expect(toCsv([['a,b', 'c']])).toBe('"a,b",c')
  })

  it('escapes fields containing quotes', () => {
    expect(toCsv([['he said "hi"', 'x']])).toBe('"he said ""hi""",x')
  })

  it('escapes fields containing newlines', () => {
    expect(toCsv([['line1\nline2', 'x']])).toBe('"line1\nline2",x')
  })

  it('coerces null/undefined/number to strings', () => {
    expect(toCsv([[null, undefined, 42]])).toBe(',,42')
  })

  it('roundtrips through parseCsv', () => {
    const rows = [
      ['name', 'note'],
      ['a,b', 'line1\nline2'],
      ['q"u"ote', 'plain'],
    ]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })

  it('defuses cells that Excel would treat as a formula', () => {
    // Each of =, +, -, @, \t, \r at the start of a cell triggers
    // formula evaluation in Excel / LibreOffice. Prefix with a tab.
    expect(toCsv([['=HYPERLINK("evil")']])).toBe('"\t=HYPERLINK(""evil"")"')
    expect(toCsv([['+1+1']])).toBe('\t+1+1')
    expect(toCsv([['-2']])).toBe('\t-2')
    expect(toCsv([['@SUM(A1)']])).toBe('\t@SUM(A1)')
  })
})
