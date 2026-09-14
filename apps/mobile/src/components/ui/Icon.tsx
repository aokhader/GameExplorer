/**
 * The shared `Icon`, typed for React Native.
 *
 * At runtime `@gameexplorer/ui` already hands this app `Icon.native.tsx` — Metro
 * prefers the native extension. TypeScript here has no module-suffix setting,
 * though, so the barrel's types are the *web* component's, where `color` is
 * optional and defaults to `currentColor`. React Native has no current colour,
 * so an icon written without one would compile and render invisible on screen.
 *
 * This re-export gives mobile code the native props, where `color` is required.
 * Import `Icon` from '@/components/ui', not from '@gameexplorer/ui'.
 */
import type { ReactElement } from 'react';
import { Icon as SharedIcon } from '@gameexplorer/ui';
import type { IconProps } from '@gameexplorer/ui/src/icons/Icon.native';

export type { IconProps };
export type { IconName } from '@gameexplorer/ui';

export const Icon = SharedIcon as unknown as (props: IconProps) => ReactElement;
