import { configureTextBuilder } from 'troika-three-text';

import { ARENA_TEXT_FONT_URL } from './arena/arenaData.ts';

let configured = false;

export function configureTextRendering(): void {
  if (configured) return;
  configured = true;
  configureTextBuilder({
    defaultFontURL: ARENA_TEXT_FONT_URL,
    useWorker: false,
  });
}
