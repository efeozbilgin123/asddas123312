export type QualityName = 'low' | 'medium' | 'high';

export interface QualityPreset {
  name: QualityName;
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  textureRes: '1k' | '2k';
  snowCount: number;
  /** Ambient occlusion (soft contact shadows) — the costly pass, desktop only. */
  ao: boolean;
  bloom: boolean;
  /** smaa: post-process AA (needed once a composer is used); msaa: renderer AA; none. */
  aa: 'smaa' | 'msaa' | 'none';
}

export const QUALITY: Record<QualityName, QualityPreset> = {
  low: { name: 'low', pixelRatio: 1, shadows: false, shadowMapSize: 0, textureRes: '1k', snowCount: 60, ao: false, bloom: false, aa: 'none' },
  medium: { name: 'medium', pixelRatio: 1.5, shadows: true, shadowMapSize: 1024, textureRes: '1k', snowCount: 150, ao: false, bloom: true, aa: 'msaa' },
  high: { name: 'high', pixelRatio: 2, shadows: true, shadowMapSize: 2048, textureRes: '2k', snowCount: 300, ao: true, bloom: true, aa: 'smaa' }
};

export function detectQuality(nav: { userAgent: string; deviceMemory?: number; hardwareConcurrency?: number }): QualityName {
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent);
  if (mobile) return nav.deviceMemory !== undefined && nav.deviceMemory <= 3 ? 'low' : 'medium';
  return nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 4 ? 'medium' : 'high';
}
