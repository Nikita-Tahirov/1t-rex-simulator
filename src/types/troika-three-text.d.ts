declare module 'troika-three-text' {
  import type { Color, Mesh } from 'three';

  export interface TextBuilderConfig {
    defaultFontURL?: string | null;
    unicodeFontsURL?: string | null;
    sdfGlyphSize?: number;
    sdfExponent?: number;
    textureWidth?: number;
    useWorker?: boolean;
  }

  export function configureTextBuilder(config: TextBuilderConfig): void;

  /**
   * Минимальная поверхность класса `Text`, используемая симулятором
   * (императивный пул всплывающих чисел урона). Поля соответствуют
   * https://protectwise.github.io/troika/troika-three-text/ — после смены
   * text/font/anchor требуется `sync()`.
   */
  export class Text extends Mesh {
    text: string;
    font: string | null;
    fontSize: number;
    color: string | number | Color;
    anchorX: number | 'left' | 'center' | 'right';
    anchorY: number | 'top' | 'top-baseline' | 'middle' | 'bottom-baseline' | 'bottom';
    outlineWidth: number | string;
    outlineColor: string | number | Color;
    fillOpacity: number;
    outlineOpacity: number;
    sync(callback?: () => void): void;
    dispose(): void;
  }
}
