declare module "gif.js" {
  type GifOptions = {
    workers?: number;
    quality?: number;
    workerScript?: string;
    width?: number;
    height?: number;
    repeat?: number;
    background?: string;
  };

  type GifFrameOptions = {
    delay?: number;
    copy?: boolean;
  };

  class GIF {
    constructor(options?: GifOptions);
    addFrame(image: HTMLCanvasElement | CanvasRenderingContext2D | ImageData, options?: GifFrameOptions): void;
    on(event: "finished" | "progress" | "abort", callback: (...args: any[]) => void): void;
    render(): void;
    abort(): void;
  }

  export default GIF;
}
