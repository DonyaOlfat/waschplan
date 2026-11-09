export function trustProxySetting(nodeEnv) {
  return nodeEnv === 'production' ? 1 : undefined;
}
