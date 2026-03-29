import { describe, test, expect } from 'vitest';
import { detectNewlyUnlocked } from '../utils/detectNewlyUnlocked';

describe('detectNewlyUnlocked', () => {
  test('returns parent node path when it transitions from locked to available', () => {
    const tree = {
      title: 'Root', path: 'Root', locked: true,
      children: [
        { title: 'Child1', path: 'Root/Child1', locked: false, children: [] },
        { title: 'Child2', path: 'Root/Child2', locked: false, children: [] },
      ],
    };
    const newStatus = { 'Root': 'available', 'Root/Child1': 'completed', 'Root/Child2': 'completed' };
    const result = detectNewlyUnlocked(tree, newStatus);
    expect(result.has('Root')).toBe(true);
  });

  test('does not return leaf nodes even when they unlock', () => {
    const tree = {
      title: 'Root', path: 'Root', locked: false,
      children: [
        { title: 'Child1', path: 'Root/Child1', locked: true, children: [] },
      ],
    };
    const newStatus = { 'Root/Child1': 'available' };
    const result = detectNewlyUnlocked(tree, newStatus);
    expect(result.has('Root/Child1')).toBe(false);
  });

  test('does not return a parent node that was already unlocked', () => {
    const tree = {
      title: 'Root', path: 'Root', locked: false,
      children: [
        { title: 'Child1', path: 'Root/Child1', locked: false, children: [] },
      ],
    };
    const newStatus = { 'Root': 'available' };
    const result = detectNewlyUnlocked(tree, newStatus);
    expect(result.has('Root')).toBe(false);
  });

  test('handles nested parents — only returns the specific tier that just unlocked', () => {
    const tree = {
      title: 'Root', path: 'Root', locked: true,
      children: [
        {
          title: 'Mid', path: 'Root/Mid', locked: true,
          children: [
            { title: 'Leaf1', path: 'Root/Mid/Leaf1', locked: false, children: [] },
          ],
        },
      ],
    };
    const newStatus = { 'Root/Mid': 'available' };
    const result = detectNewlyUnlocked(tree, newStatus);
    expect(result.has('Root/Mid')).toBe(true);
    expect(result.has('Root')).toBe(false);
  });
});
