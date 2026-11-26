// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { SlideDeck } from '../../../features/slides';
import { useDeckAutosave, AUTOSAVE_DEBOUNCE_MS } from '../useDeckAutosave';

const api = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock('../../api', () => api);

const deck = (title: string): SlideDeck => ({ id: 'deck-p1', title, topic: '', framework: 'Standard-Narrative', slides: [], activeSlideIndex: 0, createdAt: '', updatedAt: '' } as unknown as SlideDeck);
const ok = (version = 2) => ({ ok: true, json: async () => ({ version }) });
const fail = () => ({ ok: false, json: async () => ({}) });
/** The deck titles sent to the project endpoint, in order. */
const sentTitles = () => api.authedFetch.mock.calls.filter((c) => String(c[0]).includes('/presentation/deck')).map((c) => JSON.parse(c[1].body).deck.title);
const flushPromises = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

function setup(props: { projectId?: string; signedIn?: boolean } = {}) {
  const onStatus = vi.fn();
  const onSaved = vi.fn();
  const view = renderHook((p: { projectId?: string; signedIn: boolean }) => useDeckAutosave({ ...p, onStatus, onSaved }), { initialProps: { projectId: 'p1', signedIn: true, ...props } });
  return { onStatus, onSaved, ...view };
}

beforeEach(() => {
  vi.useFakeTimers();
  api.authedFetch.mockReset();
  api.authedFetch.mockResolvedValue(ok());
});
afterEach(() => vi.useRealTimers());

describe('useDeckAutosave', () => {
  it('saves a moment after the last edit, once, with the newest deck', async () => {
    const { result, onStatus, onSaved } = setup();
    act(() => { result.current.schedule(deck('one')); result.current.schedule(deck('two')); result.current.schedule(deck('three')); });
    expect(onStatus).toHaveBeenLastCalledWith('saving');
    expect(api.authedFetch).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS); });
    expect(sentTitles()).toEqual(['three']);
    expect(onStatus).toHaveBeenLastCalledWith('saved');
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ version: 2 }));
  });

  it('never lets a slow earlier save land after a later one: one runs at a time, newest last', async () => {
    let release!: (v: unknown) => void;
    api.authedFetch.mockReset();
    api.authedFetch.mockImplementationOnce(() => new Promise((r) => (release = r))).mockResolvedValue(ok(3));
    const { result, onStatus } = setup();
    act(() => result.current.schedule(deck('first')));
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS); });
    // The first request is still in flight when the next edits arrive.
    act(() => { result.current.schedule(deck('second')); result.current.schedule(deck('third')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS * 2); });
    expect(sentTitles()).toEqual(['first']); // nothing else is sent while it runs
    await act(async () => { release(ok(2)); await flushPromises(); await vi.advanceTimersByTimeAsync(0); });
    expect(sentTitles()).toEqual(['first', 'third']); // 'second' was superseded; the newest goes last
    expect(onStatus).toHaveBeenLastCalledWith('saved');
  });

  it("reports an error when the project save fails, even if the mirror would have worked, and keeps the deck for the next try", async () => {
    api.authedFetch.mockReset();
    api.authedFetch.mockResolvedValueOnce(fail()).mockResolvedValue(ok());
    const { result, onStatus, onSaved } = setup();
    act(() => result.current.schedule(deck('draft')));
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS); });
    expect(onStatus).toHaveBeenLastCalledWith('error');
    expect(onSaved).not.toHaveBeenCalled();
    expect(api.authedFetch.mock.calls.some((c) => String(c[0]).startsWith('/api/presentations/'))).toBe(false);
    // The next edit retries, and the failed deck is not lost if nothing newer replaced it.
    act(() => result.current.flush());
    await act(async () => { await flushPromises(); });
    expect(sentTitles()).toEqual(['draft', 'draft']);
    expect(onStatus).toHaveBeenLastCalledWith('saved');
  });

  it('reports an error when the request throws', async () => {
    api.authedFetch.mockReset();
    api.authedFetch.mockRejectedValue(new Error('offline'));
    const { result, onStatus } = setup();
    act(() => result.current.schedule(deck('x')));
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS); });
    expect(onStatus).toHaveBeenLastCalledWith('error');
  });

  it('sends a pending edit when the screen closes, instead of dropping it', async () => {
    const { result, unmount } = setup();
    act(() => result.current.schedule(deck('last words')));
    unmount();
    await act(async () => { await flushPromises(); });
    expect(sentTitles()).toEqual(['last words']);
  });

  it('sends a pending edit to the project it belongs to when the open project changes', async () => {
    const { result, rerender } = setup();
    act(() => result.current.schedule(deck('for p1')));
    rerender({ projectId: 'p2', signedIn: true });
    await act(async () => { await flushPromises(); });
    const urls = api.authedFetch.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).toBe('/api/projects/p1/presentation/deck');
    expect(urls.some((u) => u.includes('/projects/p2/'))).toBe(false);
  });

  it('does not call the server for a signed-out visitor or a deck with no project', () => {
    const out = setup({ signedIn: false });
    act(() => out.result.current.schedule(deck('x')));
    expect(out.onStatus).toHaveBeenLastCalledWith('signed-out');
    out.unmount();
    const none = setup({ projectId: undefined });
    act(() => none.result.current.schedule(deck('x')));
    expect(none.onStatus).toHaveBeenLastCalledWith('signed-out');
    vi.advanceTimersByTime(2000);
    expect(api.authedFetch).not.toHaveBeenCalled();
  });

  it('mirrors a successful save to the standalone deck list, best effort', async () => {
    const { result } = setup();
    api.authedFetch.mockImplementation(async (url: string) => (String(url).startsWith('/api/presentations/') ? Promise.reject(new Error('down')) : ok()));
    act(() => result.current.schedule(deck('mirror')));
    await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS); });
    expect(api.authedFetch.mock.calls.map((c) => String(c[0]))).toContain('/api/presentations/deck-p1');
  });
});
