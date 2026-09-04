import type { InputOutputAdapter } from '@yeoman/types';
export declare const adapterProgress: <ReturnType_1>(adapter: ProgressAdapter | InputOutputAdapter, fn: ProgressCallback<ReturnType_1>, options?: any) => Promise<void | ReturnType_1>;
