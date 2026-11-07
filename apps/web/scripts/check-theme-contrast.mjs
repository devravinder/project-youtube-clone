import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const THEMES_DIR = new URL("../src/themes/", import.meta.url);
const MIN_RATIO = 4.5;

const PAIRS = [
  ["button text on primary", "primary-foreground", "primary"],
  ["body text on background", "foreground", "background"],
  ["card text on card", "card-foreground", "card"],
  ["muted text on background", "muted-foreground", "background"],
  ["muted text on card", "muted-foreground", "card"],
  ["muted text on muted", "muted-foreground", "muted"],
  ["primary link on background", "primary", "background"],
  ["primary link on card", "primary", "card"],
  ["error text on background", "destructive", "background"],
  ["success text on card", "success", "card"],
];

function readTokens(css, selector) {
  const match = css.match(new RegExp(`${selector.replace(".", "\\.")}\\s*{([^}]*)}`));
  return Object.fromEntries(
    [...match[1].matchAll(/--([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [
      name,
      value.trim(),
    ]),
  );
}

function hslToRgb(hsl) {
  const [h, s, l] = hsl.match(/[\d.]+/g).map(Number);
  const saturation = s / 100;
  const lightness = l / 100;
  const a = saturation * Math.min(lightness, 1 - lightness);
  const channel = (n) => {
    const k = (n + h / 30) % 12;
    return lightness - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [channel(0), channel(8), channel(4)];
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(foreground, background) {
  const [lighter, darker] = [luminance(hslToRgb(foreground)), luminance(hslToRgb(background))].sort(
    (x, y) => y - x,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

let failures = 0;
for (const file of readdirSync(THEMES_DIR).filter((name) => name.endsWith(".css"))) {
  const css = readFileSync(join(THEMES_DIR.pathname.replace(/^\//, ""), file), "utf8");
  for (const [scheme, selector] of [
    ["light", ":root"],
    ["dark", ".dark"],
  ]) {
    const tokens = readTokens(css, selector);
    for (const [label, fg, bg] of PAIRS) {
      const ratio = contrast(tokens[fg], tokens[bg]);
      if (ratio < MIN_RATIO) {
        failures++;
        console.log(`FAIL ${file} ${scheme}: ${label} is ${ratio.toFixed(2)}:1`);
      }
    }
  }
}

console.log(
  failures === 0 ? "All palettes meet WCAG AA (4.5:1)." : `${failures} pair(s) below 4.5:1.`,
);
process.exit(failures === 0 ? 0 : 1);
