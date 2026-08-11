import { describe, expect, it } from 'vitest';

import { PagePlanError, planPages } from './plan';

const countKind = (plan: ReturnType<typeof planPages>, kind: string): number =>
  plan.entries.filter((entry) => entry.kind === kind).length;

describe('sayfa planı', () => {
  it('12 sayfalık masalı 24 sayfalık bloğa TAM oturtur', () => {
    const plan = planPages(12, 24);
    expect(plan.entries).toHaveLength(24);
    expect(plan.pagesPerStoryPage).toBe(1);
    expect(countKind(plan, 'story')).toBe(12);
    expect(countKind(plan, 'title')).toBe(1);
    expect(countKind(plan, 'dedication')).toBe(1);
    expect(countKind(plan, 'imprint')).toBe(1);
    expect(plan.blankPages).toBe(0);
    expect(plan.droppedStoryPages).toEqual([]);
    // Künye her zaman son sayfadır.
    expect(plan.entries.at(-1)?.kind).toBe('imprint');
  });

  it('kısa bebek kitabında (0-2 bandı) her masal sayfası bir yaprağa yayılır', () => {
    const plan = planPages(8, 24);
    expect(plan.pagesPerStoryPage).toBe(2);
    expect(countKind(plan, 'story')).toBe(8);
    expect(countKind(plan, 'story_text')).toBe(8);
    expect(plan.entries).toHaveLength(24);
  });

  it('16 sayfalık masalda okuma günlüğü kısalır ama sayfa sayısı yine tutar', () => {
    const plan = planPages(16, 24);
    expect(plan.entries).toHaveLength(24);
    expect(countKind(plan, 'story')).toBe(16);
    expect(plan.readingLogPages).toBe(3);
  });

  it('sığmayan masal sayfalarını sessizce atmaz, listeler', () => {
    const plan = planPages(30, 24);
    expect(plan.entries).toHaveLength(24);
    expect(plan.droppedStoryPages).toHaveLength(10);
    expect(plan.droppedStoryPages[0]).toBe(21);
  });

  it('4’ün katı olmayan blok reddedilir — matbaa böyle bir dosyayı basamaz', () => {
    expect(() => planPages(12, 26)).toThrow(PagePlanError);
    expect(() => planPages(0, 24)).toThrow(PagePlanError);
  });

  it('her sayfa numarası birbirini izler', () => {
    const plan = planPages(12, 24);
    plan.entries.forEach((entry, index) => expect(entry.pageNo).toBe(index + 1));
  });
});
