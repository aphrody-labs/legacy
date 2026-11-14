// Python `time` subset.
export const time = () => Date.now() / 1000;
export const perf_counter = () => performance.now() / 1000;
export const monotonic = perf_counter;
export const sleep = (s: number) => void Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, s * 1000);
export const ctime = () => new Date().toString();
