import { describe, expect, it } from 'vitest';
import {
  fileNameFor,
  formatClock,
  formatCueTime,
  toMarkdown,
  toPlainText,
  toSrt,
  toVtt,
} from '../lib/format';
import { findActiveIndex, findMatches, splitOnMatches } from '../lib/segments';
import type { Segment } from '../lib/types';

const segments: Segment[] = [
  { start: 1.2, dur: 3.6, text: 'Hello and welcome.' },
  { start: 65, dur: 0, text: 'Second line' },
  { start: 3723.5, dur: 2, text: 'Last one' },
];
const meta = { title: 'My Video', videoId: 'abc123' };

describe('time formatting', () => {
  it.each([
    [0, '0:00'],
    [5.9, '0:05'],
    [65, '1:05'],
    [3723, '1:02:03'],
  ])('formatClock(%d) = %s', (input, expected) => expect(formatClock(input)).toBe(expected));

  it('formats cue times', () => {
    expect(formatCueTime(3723.5, ',')).toBe('01:02:03,500');
    expect(formatCueTime(1.2345, '.')).toBe('00:00:01.235');
  });
});

describe('exports', () => {
  it('plain text with and without timestamps', () => {
    expect(toPlainText(segments, { timestamps: true })).toBe(
      '[0:01] Hello and welcome.\n[1:05] Second line\n[1:02:03] Last one',
    );
    expect(toPlainText(segments, { timestamps: false })).toBe(
      'Hello and welcome. Second line Last one',
    );
  });

  it('srt gives zero-length cues a minimum duration', () => {
    expect(toSrt(segments.slice(0, 2))).toBe(
      '1\n00:00:01,200 --> 00:00:04,800\nHello and welcome.\n\n' +
        '2\n00:01:05,000 --> 00:01:06,000\nSecond line\n',
    );
  });

  it('vtt has a header', () => {
    expect(toVtt(segments.slice(0, 1))).toBe(
      'WEBVTT\n\n00:00:01.200 --> 00:00:04.800\nHello and welcome.\n',
    );
  });

  it('markdown links each line to its moment', () => {
    expect(toMarkdown(segments.slice(1, 2), meta, { timestamps: true })).toBe(
      '# My Video\n\nhttps://www.youtube.com/watch?v=abc123\n\n' +
        '- [1:05](https://www.youtube.com/watch?v=abc123&t=65s) Second line\n',
    );
  });

  it('builds safe file names', () => {
    expect(fileNameFor('What? A/B: "test"', 'srt')).toBe('What A B test.srt');
    expect(fileNameFor('   ', 'txt')).toBe('transcript.txt');
  });
});

describe('segment helpers', () => {
  it('finds the active segment', () => {
    expect(findActiveIndex(segments, 0)).toBe(-1);
    expect(findActiveIndex(segments, 1.2)).toBe(0);
    expect(findActiveIndex(segments, 100)).toBe(1);
    expect(findActiveIndex(segments, 99999)).toBe(2);
    expect(findActiveIndex([], 5)).toBe(-1);
  });

  it('finds matches case-insensitively', () => {
    expect(findMatches(segments, 'LINE')).toEqual([1]);
    expect(findMatches(segments, '  ')).toEqual([]);
  });

  it('splits text around matches', () => {
    expect(splitOnMatches('One two one', 'one')).toEqual([
      { text: 'One', match: true },
      { text: ' two ', match: false },
      { text: 'one', match: true },
    ]);
  });
});
