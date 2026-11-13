import { requireOptionalNativeModule } from 'expo-modules-core';

export type DetectedObject = {
  label: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type NativeDetector = {
  detect(url: string): Promise<{ objects: DetectedObject[]; inferenceMs: number }>;
  speakMongolian(clips: string[]): Promise<number>;
  stopMongolian(): Promise<void>;
};

let cached: NativeDetector | null = null;

// Do not cache a failed lookup during JS startup. Expo can finish registering
// local native modules after this file was first imported.
export function getAiVision(): NativeDetector | null {
  if (cached) return cached;
  const native = requireOptionalNativeModule<NativeDetector>('AiVision');
  if (native && typeof native.detect === 'function') {
    cached = native;
    console.info('[AiVision] native module resolved');
  }
  return cached;
}
