import { expect, test } from 'vitest';
import { detectQuality, QUALITY } from '../src/world/quality';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const ANDROID = 'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

test('iPhone → medium', () => expect(detectQuality({ userAgent: IPHONE })).toBe('medium'));
test('low-memory Android → low', () => expect(detectQuality({ userAgent: ANDROID, deviceMemory: 2 })).toBe('low'));
test('strong desktop → high', () => expect(detectQuality({ userAgent: DESKTOP, hardwareConcurrency: 16 })).toBe('high'));
test('4-core desktop → medium', () => expect(detectQuality({ userAgent: DESKTOP, hardwareConcurrency: 4 })).toBe('medium'));
test('presets match spec values', () => {
  expect(QUALITY.low).toMatchObject({ pixelRatio: 1, shadows: false, textureRes: '1k', snowCount: 60 });
  expect(QUALITY.medium).toMatchObject({ pixelRatio: 1.5, shadows: true, shadowMapSize: 1024, snowCount: 150 });
  expect(QUALITY.high).toMatchObject({ pixelRatio: 2, shadowMapSize: 2048, textureRes: '2k', snowCount: 300 });
});
