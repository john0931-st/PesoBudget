/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __PESOBUDGET_BUILD_ID__: string;
declare const __PESOBUDGET_BUILD_TIME__: string;
declare const __PESOBUDGET_RELEASE_HISTORY__: Array<{
  buildId?: string;
  buildTime?: string;
  version: string;
  date: string;
  timeLabel?: string;
  title: string;
  changes: string[];
}>;

interface Window {
  __PESOBUDGET_LIVE_RELEASES__?: typeof __PESOBUDGET_RELEASE_HISTORY__;
}
