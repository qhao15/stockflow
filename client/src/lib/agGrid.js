import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);

// Matches the MUI theme (src/theme.js).
export const gridTheme = themeQuartz.withParams({
  accentColor: '#1e5eff',
  fontFamily: 'inherit',
  fontSize: 13,
  headerFontWeight: 600,
  headerBackgroundColor: '#f8f9fc',
  wrapperBorderRadius: 10,
});

export const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
