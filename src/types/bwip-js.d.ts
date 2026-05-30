declare module "bwip-js" {
  type BwipOptions = {
    bcid: string;
    text: string;
    scale?: number;
    height?: number;
    includetext?: boolean;
    textxalign?: string;
  };

  const bwipjs: {
    toBuffer(options: BwipOptions): Promise<Buffer>;
  };

  export default bwipjs;
}
