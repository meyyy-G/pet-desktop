// Figma Mood variables: background colors are rendered at 20% opacity.
export const moodPalette = Object.freeze({
  Stress: Object.freeze({ background: "#B5B5B5", icon: "#757575", calendar: "#B3B3B3", svg: "stress.svg" }),
  Low: Object.freeze({ background: "#B9D8F7", icon: "#1471DA", calendar: "#9EBEF1", svg: "low.svg" }),
  Anxious: Object.freeze({ background: "#FFB2B2", icon: "#FF6A6A", calendar: "#FCB3AD", svg: "anxious.svg" }),
  Steady: Object.freeze({ background: "#CCECBE", icon: "#8FB994", calendar: "#CFF7D3", svg: "steady.svg" }),
  Light: Object.freeze({ background: "#FED2CB", icon: "#FFA59E", calendar: "#FEE9E7", svg: "light.svg" }),
  Inspired: Object.freeze({ background: "#D0BCFF", icon: "#B69DF8", calendar: "#FAE1FA", svg: "inspired.svg" }),
  Grateful: Object.freeze({ background: "#FAEDB7", icon: "#FFCC00", calendar: "#FFE8A3", svg: "greatfull.svg" }),
});

export const moodColors = Object.freeze(Object.fromEntries(Object.entries(moodPalette).map(([name, colors]) => [name, colors.icon])));
export const calendarMoodColors = Object.freeze(Object.fromEntries(Object.entries(moodPalette).map(([name, colors]) => [name, colors.calendar])));

export function moodBackground(name) {
  const color = moodPalette[name]?.background;
  return color ? `${color}33` : "";
}

export function applyMoodPaletteToControls() {
  for (const button of document.querySelectorAll("[data-mood], [data-entry-mood]")) {
    const name = button.dataset.mood || button.dataset.entryMood;
    const colors = moodPalette[name];
    if (!colors) continue;
    button.style.setProperty("--mood-color", colors.icon);
    button.style.setProperty("--mood-fill", moodBackground(name));
    button.style.setProperty("--entry-mood", colors.icon);
    button.style.setProperty("--entry-mood-fill", moodBackground(name));
  }
  for (const item of document.querySelectorAll("[data-legend-mood]")) {
    const color = moodPalette[item.dataset.legendMood]?.calendar;
    if (color) item.style.setProperty("--legend-color", color);
  }
}
