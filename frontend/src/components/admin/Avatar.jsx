import { useEffect, useState } from "react";

const DICEBEAR = "https://api.dicebear.com/7.x/initials/svg?seed=";

// Reusable admin avatar: shows an uploaded photo (src) when provided, otherwise
// a generated image, and finally falls back to initials if the image can't load
// (e.g. offline dev). Used in the header profile chip.
export default function Avatar({ name, src, size = 40 }) {
  const [ok, setOk] = useState(true);
  const label = name || "Admin";
  const initials = label.trim().slice(0, 2).toUpperCase();
  const imgSrc = src || DICEBEAR + encodeURIComponent(label);
  const style = { height: size, width: size };

  // Reset the error state whenever the image source changes (e.g. a new photo
  // is uploaded) so an earlier load failure doesn't keep us on the initials.
  useEffect(() => setOk(true), [imgSrc]);

  if (ok) {
    return (
      <img
        src={imgSrc}
        onError={() => setOk(false)}
        alt={label}
        style={style}
        className="rounded-full bg-cg-dark object-cover ring-2 ring-white/70"
      />
    );
  }
  return (
    <span
      style={style}
      className="grid place-items-center rounded-full bg-cg-dark text-sm font-bold text-white ring-2 ring-white/70"
    >
      {initials}
    </span>
  );
}
