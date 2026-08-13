import { useEffect, useRef, useState } from "react";
import api from "../api/client";

// An account's avatar, for admin and supervisor headers and settings.
//
// TWO KINDS OF `avatarUrl` HAVE TO WORK, and that is the whole reason this is
// not a plain <img>:
//
//   1. An EXTERNAL URL. Until now the only way to set one was to paste a link
//      into the admin Settings form — see the comment at the top of that file,
//      "without a file-storage service". Those must keep rendering.
//
//   2. An UPLOADED FILE, new with POST /me/avatar. Those are stored through
//      CaseAttachmentService and served from /api/v1/complaints/attachments/…,
//      which is @PreAuthorize("isAuthenticated()"). A bare <img src> sends no
//      Authorization header, so it would 401 and show a broken image.
//
// So an app-relative path is fetched as a blob through axios; anything with a
// scheme is handed straight to the browser. Object URLs are revoked on unmount
// and before each refetch — this renders in the header of every screen.
//
// Falls back to an initial, silently. A missing avatar is an ordinary state.
export default function UserAvatar({ src, name, size = 36, className = "" }) {
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

    // An absolute URL (or a data: URI) is not ours to authenticate.
    if (/^(https?:)?\/\//i.test(src) || src.startsWith("data:")) {
      setUrl(src);
      return undefined;
    }

    // axios already carries the /api/v1 baseURL; leaving the prefix on
    // produces /api/v1/api/v1/… and a silent 404. CLAUDE.md section 8.
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
        // Fall back to the initial rather than reporting it.
      });

    return () => {
      alive = false;
      revoke();
    };
  }, [src]);

  const initial = (name || "").trim().slice(0, 1).toUpperCase() || "?";
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
      className={`grid shrink-0 place-items-center rounded-full bg-cg-dark text-sm font-bold text-white ${className}`}
    >
      {initial}
    </span>
  );
}
