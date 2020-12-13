// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const chunk = <T extends any>(arr: T[], len: number) => {
  const chunks = [];
  let i = 0;
  const n = arr.length;

  while (i < n) {
    chunks.push(arr.slice(i, (i += len)));
  }

  return chunks;
};
