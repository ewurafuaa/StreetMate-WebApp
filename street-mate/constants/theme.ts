/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

//constants/theme.ts
import { Platform } from 'react-native';

const tintColorLight = '#0a7ea4';
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: tintColorLight,
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

// Uber-style design tokens (see DESIGN-uber.md): a black-and-white duet with greys.
// There is deliberately no accent colour. Black is the only call-to-action colour.
export const Palette = {
  Black: '#000000',
  White: '#FFFFFF',
  CustomBlack: '#000000', // kept so older screens keep compiling
  Elevated: '#282828', // near-black, pressed/hover on black surfaces
  Soft: '#EFEFEF', // chips, input rows, icon buttons
  Softer: '#F3F3F3',
  Pressed: '#E2E2E2',
  GrayBackground: '#EFEFEF',
  LightGray: '#E2E2E2', // hairlines and dividers
  Placeholder: '#AFAFAF', // placeholder + fine print ("mute")
  DarkGray: '#5E5E5E', // secondary text ("body")
  Green: '#39B221', // only used for the live-GPS dot
  Red: '#D32B2B', // only used for destructive actions
};

export const Radius = {
  md: 8,
  lg: 12,
  xl: 16, // cards
  sheet: 24, // bottom sheets
  pill: 999, // every interactive element
};

export const Shadow = {
  // Level 3: the white pill floating over a map
  float: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 4,
  },
  // Level 2: sheets and the ride-request card
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 10,
  },
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});