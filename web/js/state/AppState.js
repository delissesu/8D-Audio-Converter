export function createAppState() {
  return {
    selectedFile: null,
    currentJobId: null,
    pollingInterval: null,
    currentTrimStart: 0,
    currentTrimEnd: 0,
  };
}
