import { describe, expect, it } from 'vitest';
import { findAllByKey, textOf } from '../lib/json';
import {
  normalizeSegments,
  parseDomRows,
  parseJson3,
  parseTimestamp,
  parseTranscriptPanel,
} from '../lib/parse';
import getTranscriptFixture from './fixtures/get_transcript.json';
import json3Fixture from './fixtures/json3.json';

describe('findAllByKey', () => {
  it('finds nested values in document order', () => {
    const data = { a: [{ x: 1 }, { b: { x: 2 } }], c: { x: 3 } };
    expect(findAllByKey(data, 'x')).toEqual([1, 2, 3]);
  });

  it('respects the limit', () => {
    expect(findAllByKey({ a: { x: 1 }, b: { x: 2 } }, 'x', 1)).toEqual([1]);
  });
});

describe('textOf', () => {
  it('reads simpleText and runs', () => {
    expect(textOf({ simpleText: 'hi' })).toBe('hi');
    expect(textOf({ runs: [{ text: 'a' }, { text: 'b' }] })).toBe('ab');
    expect(textOf(undefined)).toBe('');
  });
});

describe('parseJson3', () => {
  it('joins segs, skips empty events and trims overlaps', () => {
    expect(parseJson3(json3Fixture)).toEqual([
      { start: 0.16, dur: 2.8, text: 'hey everyone' },
      { start: 2.96, dur: 3, text: 'welcome back to the channel' },
      { start: 7, dur: 2.5, text: 'today &amp; tomorrow' },
    ]);
  });

  it('returns [] for unexpected input', () => {
    expect(parseJson3(null)).toEqual([]);
    expect(parseJson3({ events: 'nope' })).toEqual([]);
  });
});

describe('parseTranscriptPanel', () => {
  const { segments, languages } = parseTranscriptPanel(getTranscriptFixture);

  it('reads segments and ignores section headers', () => {
    expect(segments).toEqual([
      { start: 1.2, dur: 3.6, text: 'Hello and welcome.' },
      { start: 4.8, dur: 4.2, text: "Today we're building an extension." },
      { start: 3723, dur: 2.5, text: 'Thanks for watching!' },
    ]);
  });

  it('reads the language menu', () => {
    expect(languages).toEqual([
      { title: 'English', selected: true, params: 'PARAMS_EN' },
      { title: 'English (auto-generated)', selected: false, params: 'PARAMS_A_EN' },
    ]);
  });
});

describe('parseTimestamp', () => {
  it.each([
    ['0:05', 5],
    ['2:03', 123],
    ['1:02:03', 3723],
    [' 10:00 ', 600],
  ])('%s -> %d', (input, expected) => expect(parseTimestamp(input)).toBe(expected));

  it.each(['', 'abc', '1:2:3:4', '1:-2'])('rejects %j', (input) =>
    expect(parseTimestamp(input)).toBeNaN(),
  );
});

describe('parseDomRows', () => {
  it('derives durations from the next row', () => {
    const rows = [
      { timestamp: '0:00', text: ' first ' },
      { timestamp: 'bad', text: 'skipped' },
      { timestamp: '0:04', text: 'second' },
    ];
    expect(parseDomRows(rows, 5)).toEqual([
      { start: 0, dur: 4, text: 'first' },
      { start: 4, dur: 5, text: 'second' },
    ]);
  });
});

describe('normalizeSegments', () => {
  it('sorts, cleans whitespace and drops empty lines', () => {
    expect(
      normalizeSegments([
        { start: 5, dur: 1, text: 'b' },
        { start: 1, dur: 10, text: '  a\n​ ' },
        { start: 3, dur: 1, text: '   ' },
      ]),
    ).toEqual([
      { start: 1, dur: 4, text: 'a' },
      { start: 5, dur: 1, text: 'b' },
    ]);
  });
});
