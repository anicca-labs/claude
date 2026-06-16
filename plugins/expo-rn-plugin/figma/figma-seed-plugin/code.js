// Figma plugin: seeds a generic starter set of design tokens as Figma Variables.
// Run once in development mode on a blank file, then customize the variables to
// match your brand. Replace the token values below with your own before seeding.

const lightColors = {
  "surface-app": "rgba(255,255,255,1)",
  "surface-primary": "rgba(252,250,248,1)",
  "surface-secondary": "rgba(247,242,236,1)",
  "surface-tertiary": "rgba(237,231,225,1)",
  "surface-invert": "rgba(9,13,18,1)",
  "surface-overlay-ios": "rgba(255,255,255,0.8)",
  "surface-overlay-android": "rgba(255,255,255,0.95)",
  "surface-success": "rgba(6,174,114,1)",
  "surface-warning": "rgba(255,209,13,1)",
  "surface-danger": "rgba(207,71,88,1)",
  "surface-system": "rgba(12,140,233,1)",
  "background-page": "rgba(255,255,255,1)",
  "background-body": "rgba(237,240,242,1)",
  "background-secondary": "rgba(44,54,64,1)",
  "background-subtle": "rgba(211,220,229,1)",
  "background-subtle-hover": "rgba(237,240,242,1)",
  "background-subtle-pressed": "rgba(157,167,178,1)",
  "background-inactive": "rgba(68,78,89,1)",
  "background-brand": "rgba(0,122,255,1)",
  "background-brand-hover": "rgba(82,151,224,1)",
  "background-brand-pressed": "rgba(31,100,173,1)",
  "background-action": "rgba(23,30,38,1)",
  "background-action-hover": "rgba(44,54,64,1)",
  "background-action-pressed": "rgba(0,0,0,1)",
  "background-success": "rgba(180,240,168,1)",
  "background-success-hover": "rgba(218,247,212,1)",
  "background-success-pressed": "rgba(143,232,125,1)",
  "background-error": "rgba(240,168,180,1)",
  "background-error-hover": "rgba(247,212,218,1)",
  "background-error-pressed": "rgba(232,125,143,1)",
  "background-warning": "rgba(232,196,125,1)",
  "background-warning-hover": "rgba(247,235,212,1)",
  "background-warning-pressed": "rgba(232,196,125,1)",
  "background-scrim": "rgba(0,0,0,0.6)",
  "border-strong": "rgba(44,54,64,1)",
  "border-subtle": "rgba(211,220,229,1)",
  "border-brand": "rgba(0,122,255,1)",
  "border-contrast": "rgba(0,0,0,0.4)",
  "border-default": "rgba(237,231,225,1)",
  "border-active": "rgba(13,98,91,1)",
  "border-inverted": "rgba(9,13,18,1)",
  "text-body": "rgba(0,0,0,1)",
  "text-subtle": "rgba(68,78,89,1)",
  "text-inactive": "rgba(157,167,178,1)",
  "text-brand": "rgba(0,122,255,1)",
  "text-action": "rgba(8,25,43,1)",
  "text-action-hover": "rgba(15,50,87,1)",
  "text-action-inverse": "rgba(255,255,255,1)",
  "text-success": "rgba(41,130,23,1)",
  "text-error": "rgba(130,23,41,1)",
  "text-warning": "rgba(130,94,23,1)",
  "text-primary": "rgba(9,13,18,1)",
  "text-secondary": "rgba(21,24,28,1)",
  "text-tertiary": "rgba(91,88,83,1)",
  "text-inverted": "rgba(255,255,255,1)",
  "icon-primary": "rgba(17,19,21,1)",
  "icon-secondary": "rgba(91,88,83,1)",
  "icon-inverted": "rgba(255,255,255,1)",
  "button-background-default-basic": "rgba(211,220,229,1)",
  "button-background-default-cta": "rgba(23,30,38,1)",
  "button-background-default-brand": "rgba(0,122,255,1)",
  "button-background-active-basic": "rgba(157,167,178,1)",
  "button-background-active-cta": "rgba(0,0,0,1)",
  "button-background-active-brand": "rgba(31,100,173,1)",
  "button-background-inactive-basic": "rgba(211,220,229,1)",
  "button-background-inactive-cta": "rgba(211,220,229,1)",
  "button-background-inactive-brand": "rgba(68,78,89,1)",
  "splash-background": "rgba(118,127,245,1)",
  "splash-background2": "rgba(215,221,211,1)",
};

const darkColors = {
  "surface-app": "rgba(9,13,18,1)",
  "surface-primary": "rgba(17,19,21,1)",
  "surface-secondary": "rgba(21,24,28,1)",
  "surface-tertiary": "rgba(47,51,55,1)",
  "surface-invert": "rgba(255,255,255,1)",
  "surface-overlay-ios": "rgba(30,30,30,0.8)",
  "surface-overlay-android": "rgba(18,18,18,0.95)",
  "surface-success": "rgba(6,174,114,1)",
  "surface-warning": "rgba(255,209,13,1)",
  "surface-danger": "rgba(207,71,88,1)",
  "surface-system": "rgba(12,140,233,1)",
  "background-page": "rgba(0,0,0,1)",
  "background-body": "rgba(23,30,38,1)",
  "background-secondary": "rgba(211,220,229,1)",
  "background-subtle": "rgba(44,54,64,1)",
  "background-subtle-hover": "rgba(23,30,38,1)",
  "background-subtle-pressed": "rgba(68,78,89,1)",
  "background-inactive": "rgba(157,167,178,1)",
  "background-brand": "rgba(0,122,255,1)",
  "background-brand-hover": "rgba(31,100,173,1)",
  "background-brand-pressed": "rgba(82,151,224,1)",
  "background-action": "rgba(237,240,242,1)",
  "background-action-hover": "rgba(211,220,229,1)",
  "background-action-pressed": "rgba(255,255,255,1)",
  "background-success": "rgba(27,87,15,1)",
  "background-success-hover": "rgba(14,43,8,1)",
  "background-success-pressed": "rgba(41,130,23,1)",
  "background-error": "rgba(87,15,27,1)",
  "background-error-hover": "rgba(43,8,14,1)",
  "background-error-pressed": "rgba(130,23,41,1)",
  "background-warning": "rgba(87,63,15,1)",
  "background-warning-hover": "rgba(43,31,8,1)",
  "background-warning-pressed": "rgba(130,94,23,1)",
  "background-scrim": "rgba(0,0,0,0.4)",
  "border-strong": "rgba(211,220,229,1)",
  "border-subtle": "rgba(44,54,64,1)",
  "border-brand": "rgba(0,122,255,1)",
  "border-contrast": "rgba(255,255,255,0.4)",
  "border-default": "rgba(47,51,55,1)",
  "border-active": "rgba(6,174,155,1)",
  "border-inverted": "rgba(255,255,255,1)",
  "text-body": "rgba(255,255,255,1)",
  "text-subtle": "rgba(157,167,178,1)",
  "text-inactive": "rgba(68,78,89,1)",
  "text-brand": "rgba(0,122,255,1)",
  "text-action": "rgba(212,229,247,1)",
  "text-action-hover": "rgba(168,203,240,1)",
  "text-action-inverse": "rgba(0,0,0,1)",
  "text-success": "rgba(143,232,125,1)",
  "text-error": "rgba(232,125,143,1)",
  "text-warning": "rgba(232,196,125,1)",
  "text-primary": "rgba(255,255,255,1)",
  "text-secondary": "rgba(211,220,229,1)",
  "text-tertiary": "rgba(157,167,178,1)",
  "text-inverted": "rgba(9,13,18,1)",
  "icon-primary": "rgba(255,255,255,1)",
  "icon-secondary": "rgba(157,167,178,1)",
  "icon-inverted": "rgba(9,13,18,1)",
  "button-background-default-basic": "rgba(44,54,64,1)",
  "button-background-default-cta": "rgba(237,240,242,1)",
  "button-background-default-brand": "rgba(0,122,255,1)",
  "button-background-active-basic": "rgba(68,78,89,1)",
  "button-background-active-cta": "rgba(255,255,255,1)",
  "button-background-active-brand": "rgba(82,151,224,1)",
  "button-background-inactive-basic": "rgba(44,54,64,1)",
  "button-background-inactive-cta": "rgba(44,54,64,1)",
  "button-background-inactive-brand": "rgba(157,167,178,1)",
  "splash-background": "rgba(118,127,245,1)",
  "splash-background2": "rgba(215,221,211,1)",
};

const sizes = {
  hairline: 1, xs: 4, sm: 8, md: 16, lg: 24, xl: 36,
  "2xl": 64, "3xl": 80, "4xl": 128, "5xl": 192, "6xl": 256, "7xl": 384,
  "button-xs": 2, "button-sm": 4, "button-md": 6,
  "button-lg": 8, "button-xl": 10, "button-2xl": 12, "button-3xl": 16,
};

const radius = {
  xs: 2, sm: 4, md: 8, lg: 12, xl: 16, "2xl": 32, full: 9999,
};

const fontSizes = {
  "0": 12, "1": 14, "2": 16, "3": 18, "4": 20,
  "5": 24, "6": 28, "7": 32, "8": 36, "9": 48, "10": 64, "11": 80, "12": 80,
};

const lineHeights = {
  "0": 16, "1": 18, "2": 20, "3": 22, "4": 24,
  "5": 28, "6": 32, "7": 38, "8": 40, "9": 44, "10": 56, "11": 72, "12": 88,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseColor(str) {
  if (str.startsWith("#")) {
    const hex = str.slice(1);
    return {
      r: parseInt(hex.slice(0, 2), 16) / 255,
      g: parseInt(hex.slice(2, 4), 16) / 255,
      b: parseInt(hex.slice(4, 6), 16) / 255,
      a: 1,
    };
  }
  const m = str.match(/rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)/);
  return {
    r: parseInt(m[1]) / 255,
    g: parseInt(m[2]) / 255,
    b: parseInt(m[3]) / 255,
    a: m[4] != null ? parseFloat(m[4]) : 1,
  };
}

function seedFloatCollection(name, tokens) {
  const col = figma.variables.createVariableCollection(name);
  const modeId = col.defaultModeId;
  col.renameMode(modeId, "Default");
  for (const [tokenName, value] of Object.entries(tokens)) {
    const v = figma.variables.createVariable(tokenName, col, "FLOAT");
    v.setValueForMode(modeId, value);
  }
  return col;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

(function seed() {
  // Delete any existing collections so re-running is safe.
  const existing = figma.variables.getLocalVariableCollections();
  for (const c of existing) {
    c.remove();
  }

  // Colors — Light mode only (multiple modes require paid plan)
  const colorCol = figma.variables.createVariableCollection("Colors");
  const lightModeId = colorCol.defaultModeId;
  colorCol.renameMode(lightModeId, "Light");

  for (const name of Object.keys(lightColors)) {
    const v = figma.variables.createVariable(name, colorCol, "COLOR");
    v.setValueForMode(lightModeId, parseColor(lightColors[name]));
  }

  // Sizes & Spaces
  seedFloatCollection("Sizes & Spaces", sizes);

  // Radius
  seedFloatCollection("Radius", radius);

  // Font Sizes
  const fontSizesMapped = {};
  for (const k of Object.keys(fontSizes)) {
    fontSizesMapped["size-" + k] = fontSizes[k];
  }
  seedFloatCollection("Font Sizes", fontSizesMapped);

  // Line Heights
  const lineHeightsMapped = {};
  for (const k of Object.keys(lineHeights)) {
    lineHeightsMapped["lineHeight-" + k] = lineHeights[k];
  }
  seedFloatCollection("Line Heights", lineHeightsMapped);

  figma.closePlugin(
    "Done! Created 5 collections with " + Object.keys(lightColors).length + " color variables + sizes, radius, font sizes, line heights."
  );
})();
