import { useEffect, useRef, useState } from "react";
import api from "../../api/client";

// The worker's photo, anywhere it appears.
//
// WHY THIS IS NOT A PLAIN <img src>.
//   Photos are stored through CaseAttachmentService and served from
//   /api/v1/complaints/attachments/{name}, which is @PreAuthorize
//   ("isAuthenticated()"). A bare <img> tag sends no Authorization header, so
//   it would 401 and render a broken image. Nobody noticed because until now
//   no photo could be uploaded at all and every avatar fell back to an initial.
//
//   So the file is fetched through axios as a blob, exactly as CaseEvidence
//   does for complaint attachments, and shown from an object URL.
//
//   Object URLs are revoked on unmount and before each refetch — otherwise the
//   blob stays in memory for the life of the tab, and this component renders in
//   the header of every single screen.
//
// FALLS BACK TO AN INITIAL, silently. A missing or unloadable photo is an
// ordinary state, not an error worth showing a worker.
export default function WorkerAvatar({ src, name, size = 36, className = "" }) {
  const [url, setUrl] = useState(null);
  const urlRef = useRef(null);

  useEffect(() => {
    let alive = true;

    const revoke = () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };

    revoke();
    setUrl(null);
    if (!src) return undefined;

    // Stored as an app-relative path (/api/v1/...); axios already carries the
    // /api/v1 baseURL, so the prefix is stripped or the request becomes
    // /api/v1/api/v1/... and 404s silently. See CLAUDE.md section 8.
    const path = src.replace(/^\/api\/v1/, "");
    api
      .get(path, { responseType: "blob" })
      .then((res) => {
        if (!alive) return;
        const made = URL.createObjectURL(res.data);
        urlRef.current = made;
        setUrl(made);
      })
      .catch(() => {
        // Fall back to the initial. A worker does not need to be told their
        // avatar failed to load.
      });

    return () => {
      alive = false;
      revoke();
    };
  }, [src]);

  const initial = (name || "").trim().slice(0, 1) || "?";
  const box = { width: size, height: size };

  if (url) {
    return (
      <img
        src={url}
        alt=""
        style={box}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }

  return (
    <span
      style={box}
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-[#14493B] font-extrabold text-white ${className}`}
    >
      {initial}
    </span>
  );
}
