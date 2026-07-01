import { createRoot } from 'react-dom/client';
import { bridge, isVkEnvironment } from './utils/vkBridgeClient';
import { ConfigProvider, AdaptivityProvider, AppRoot } from '@vkontakte/vkui';
import { RouterProvider } from '@vkontakte/vk-mini-apps-router';
import '@vkontakte/vkui/dist/vkui.css';
import './style.css';

import { App } from './App';
import { router } from './router';

const isIos = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);

if (isVkEnvironment() && typeof bridge.send === 'function') {
  bridge.send('VKWebAppInit').catch(() => {});
}

const container = document.getElementById('root');
const root = createRoot(container!);

root.render(
  <ConfigProvider colorScheme="light" platform={isIos ? 'ios' : 'android'}>
    <AdaptivityProvider>
      <AppRoot mode="full" className="mashuk-root">
        <RouterProvider router={router}>
          <App />
        </RouterProvider>
      </AppRoot>
    </AdaptivityProvider>
  </ConfigProvider>
);
