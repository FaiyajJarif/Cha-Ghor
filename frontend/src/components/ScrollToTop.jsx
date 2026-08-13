import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// On every route (or hash) change: scroll to the linked section when the URL
// has a hash (#about, #contact, ...), otherwise reset to the top of the page.
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      // Wait a tick so the target section is mounted after a page change.
      const t = setTimeout(() => {
        const el = document.getElementById(hash.slice(1));
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 60);
      return () => clearTimeout(t);
    }
    window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }, [pathname, hash]);

  return null;
}
