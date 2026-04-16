declare module "*/vendor/jszip.min.js" {
  export default JSZip;
}

declare class JSZip {
  file(name: string): JSZipObject | null;
  file(name: RegExp): JSZipObject[];
  file(name: string, data: any, options?: JSZipFileOptions): this;
  folder(name: string): JSZip | null;
  folder(name: RegExp): JSZipObject[];
  forEach(callback: (relativePath: string, file: JSZipObject) => void): void;
  loadAsync(data: ArrayBuffer | Uint8Array | Blob | string, options?: JSZipLoadOptions): Promise<JSZip>;
  generateAsync(options: JSZipGeneratorOptions): Promise<ArrayBuffer | Blob | Uint8Array | string>;
  files: { [key: string]: JSZipObject };
}

interface JSZipObject {
  name: string;
  dir: boolean;
  date: Date;
  async(type: "arraybuffer"): Promise<ArrayBuffer>;
  async(type: "uint8array"): Promise<Uint8Array>;
  async(type: "blob"): Promise<Blob>;
  async(type: "string"): Promise<string>;
  async(type: "base64"): Promise<string>;
}

interface JSZipFileOptions {
  binary?: boolean;
  date?: Date;
  compression?: string;
  comment?: string;
  dir?: boolean;
}

interface JSZipLoadOptions {
  base64?: boolean;
  checkCRC32?: boolean;
  optimizedBinaryString?: boolean;
  createFolders?: boolean;
}

interface JSZipGeneratorOptions {
  type: "arraybuffer" | "blob" | "uint8array" | "base64" | "string";
  compression?: string;
  compressionOptions?: { level: number };
  mimeType?: string;
}
