import { describe, expect, it } from 'vitest';
import { shouldApplyWatermarkForTool } from '@imageops/core';

describe('watermark policy', () => {
  it('applies watermark to advanced tool output on free plan', () => {
    expect(shouldApplyWatermarkForTool('free', 'background-remove')).toBe(true);
  });

  it('does not apply watermark to basic tools on free plan', () => {
    expect(shouldApplyWatermarkForTool('free', 'compress')).toBe(false);
    expect(shouldApplyWatermarkForTool('free', 'resize')).toBe(false);
  });

  it('does not apply watermark to paid plans', () => {
    expect(shouldApplyWatermarkForTool('pro', 'background-remove')).toBe(false);
    expect(shouldApplyWatermarkForTool('team', 'background-remove')).toBe(false);
  });
});
