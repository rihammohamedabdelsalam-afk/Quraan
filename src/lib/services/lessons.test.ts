import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../supabase', () => ({
  supabase: { rpc: vi.fn() },
}));

import { supabase } from '../supabase';
import { completeLesson, markLessonAbsent, cancelLesson } from './lessons';

const rpc = supabase.rpc as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => rpc.mockReset());

describe('completeLesson', () => {
  it('maps a fresh completion (Scenario 1/2: progress advances, no false collection flag)', async () => {
    rpc.mockResolvedValueOnce({
      data: [{
        lesson_id: 'l1', cycle_id: 'c1', progress: 3, total_lessons: 8,
        collection_created: false, cycle_completed: false, next_cycle_id: null,
        already_completed: false,
      }],
      error: null,
    });
    const res = await completeLesson('l1');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.progress).toBe(3);
      expect(res.data.collectionCreated).toBe(false);
    }
  });

  it('reports collection created exactly once at threshold (Scenario 2)', async () => {
    rpc.mockResolvedValueOnce({
      data: [{
        lesson_id: 'l4', cycle_id: 'c1', progress: 4, total_lessons: 8,
        collection_created: true, cycle_completed: false, next_cycle_id: null,
        already_completed: false,
      }],
      error: null,
    });
    const res = await completeLesson('l4');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.collectionCreated).toBe(true);
  });

  it('is idempotent: repeat call returns already_completed, no new collection (Scenario 3/9)', async () => {
    rpc.mockResolvedValueOnce({
      data: [{
        lesson_id: 'l4', cycle_id: 'c1', progress: 4, total_lessons: 8,
        collection_created: false, cycle_completed: false, next_cycle_id: null,
        already_completed: true,
      }],
      error: null,
    });
    const res = await completeLesson('l4');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.alreadyCompleted).toBe(true);
      expect(res.data.collectionCreated).toBe(false);
    }
  });

  it('reports cycle completion at 8/8 (Scenario 4)', async () => {
    rpc.mockResolvedValueOnce({
      data: [{
        lesson_id: 'l8', cycle_id: 'c1', progress: 8, total_lessons: 8,
        collection_created: false, cycle_completed: true, next_cycle_id: 'c2',
        already_completed: false,
      }],
      error: null,
    });
    const res = await completeLesson('l8');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.cycleCompleted).toBe(true);
      expect(res.data.nextCycleId).toBe('c2');
    }
  });

  it('never leaks a raw Postgres error to the caller', async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "uq_collections_one_per_cycle"' },
    });
    const res = await completeLesson('l4');
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).not.toMatch(/constraint|postgres|sql/i);
    }
  });
});

describe('markLessonAbsent / cancelLesson (Scenario: absence consumes, cancellation does not)', () => {
  it('markLessonAbsent succeeds via RPC (progress handled DB-side)', async () => {
    rpc.mockResolvedValueOnce({ error: null });
    const res = await markLessonAbsent('l5');
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('mark_lesson_absent', { p_lesson_id: 'l5' });
  });

  it('cancelLesson passes a reason through and does not touch progress client-side', async () => {
    rpc.mockResolvedValueOnce({ error: null });
    const res = await cancelLesson('l6', 'الطالب طلب الإلغاء');
    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('cancel_lesson', {
      p_lesson_id: 'l6',
      p_reason: 'الطالب طلب الإلغاء',
    });
  });
});
