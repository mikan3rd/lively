export const Topic = {
  BulkTrendMessageQueue: "BulkTrendMessageQueue",
  PostTrendMessage: "PostTrendMessage",
} as const;

export const toBufferJson = <T>(data: T) => {
  const dataJson = JSON.stringify(data);
  const dataBuffer = Buffer.from(dataJson);
  return dataBuffer;
};
