export function accessibleAccent(candidate: string) {
  if (!/^#[0-9a-fA-F]{6}$/.test(candidate)) return '#21504b';
  const [red, green, blue] = candidate
    .slice(1)
    .match(/.{2}/g)!
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    );
  const contrast =
    1.05 / (0.2126 * red + 0.7152 * green + 0.0722 * blue + 0.05);
  return contrast >= 4.5 ? candidate : '#21504b';
}
