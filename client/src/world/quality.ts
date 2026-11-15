export type QualityName = 'low' | 'medium' | 'high';

export interface QualityPreset {
  name: QualityName;
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  textureRes: '1k' | '2k';
  snowCount: number;
}

export const QUALITY: Record<QualityName, QualityPreset> = {
  low: { name: 'low', pixelRatio: 1, shadows: false, shadowMapSize: 0, textureRes: '1k', snowCount: 60 },
  medium: { name: 'medium', pixelRatio: 1.5, shadows: true, shadowMapSize: 1024, textureRes: '1k', snowCount: 150 },
  high: { name: 'high', pixelRatio: 2, shadows: true, shadowMapSize: 2048, textureRes: '2k', snowCount: 300 }
};

export function detectQuality(nav: { userAgent: string; deviceMemory?: number; hardwareConcurrency?: number }): QualityName {
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent);
  if (mobile) return nav.deviceMemory !== undefined && nav.deviceMemory <= 3 ? 'low' : 'medium';
  return nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 4 ? 'medium' : 'high';
}
