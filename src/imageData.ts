export class NodeImageData implements ImageData {
  readonly colorSpace: PredefinedColorSpace = 'srgb';
  readonly data: Uint8ClampedArray;
  readonly height: number;
  readonly width: number;

  constructor(data: Uint8ClampedArray, width: number, height?: number) {
    if (!Number.isInteger(width) || width <= 0) {
      throw new Error('ImageData width must be a positive integer.');
    }

    const resolvedHeight = height ?? data.length / 4 / width;
    if (!Number.isInteger(resolvedHeight) || resolvedHeight <= 0) {
      throw new Error('ImageData height must be a positive integer.');
    }

    if (data.length !== width * resolvedHeight * 4) {
      throw new Error(`ImageData buffer has ${data.length} bytes for ${width}x${resolvedHeight}.`);
    }

    this.data = data;
    this.width = width;
    this.height = resolvedHeight;
  }
}

export function installImageDataShim() {
  if (typeof globalThis.ImageData === 'undefined') {
    Object.defineProperty(globalThis, 'ImageData', {
      configurable: true,
      writable: true,
      value: NodeImageData,
    });
  }
}

export function createImageData(data: Uint8ClampedArray, width: number, height: number): ImageData {
  return new NodeImageData(data, width, height);
}
