import vkBridgeModule from '@vkontakte/vk-bridge';

const mod = vkBridgeModule as unknown as { default?: typeof vkBridgeModule };
export const bridge = mod.default ?? vkBridgeModule;
export function isVkEnvironment(): boolean {
  return typeof bridge.isEmbedded === 'function' && bridge.isEmbedded();
}
