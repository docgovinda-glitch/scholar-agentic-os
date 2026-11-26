import { describe, it, expect } from 'vitest';
import { xmlText } from '../xmlText';

const ch = (...codes: number[]) => String.fromCharCode(...codes);

describe('xmlText', () => {
  it('leaves ordinary text, tabs, line feeds and carriage returns alone', () => {
    const text = 'Fish & Chips <b>"quoted"</b>\tnext\nline\r\nend, 日本語 😀 ’smart’ — dash';
    expect(xmlText(text)).toBe(text);
  });

  it('removes the control characters XML 1.0 forbids', () => {
    expect(xmlText(`a${ch(0)}b${ch(1)}c${ch(8)}d${ch(14)}e${ch(31)}f${ch(0xfffe)}g${ch(0xffff)}h`)).toBe('abcdefgh');
  });

  it('turns the line breaks PDF and Word leave behind into line feeds', () => {
    expect(xmlText(`one${ch(0x0c)}two${ch(0x0b)}three${ch(0x85)}four${ch(0x2028)}five${ch(0x2029)}six`)).toBe('one\ntwo\nthree\nfour\nfive\nsix');
  });

  it('drops a lone surrogate half but keeps a whole emoji', () => {
    expect(xmlText(`x${ch(0xd83d)}y`)).toBe('xy');
    expect(xmlText(`x${ch(0xde00)}y`)).toBe('xy');
    expect(xmlText('x😀y')).toBe('x😀y');
  });
});
