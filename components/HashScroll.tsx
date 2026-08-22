"use client";

import { useEffect } from "react";
import { safeHashId } from "@/lib/hash-scroll";

/** Next.js often skips native hash scroll on in-app links. Jump after paint. */
export function HashScroll() {
  useEffect(() => {
    let timer = 0;

    function jump() {
      const id = safeHashId(window.location.hash);
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ block: "start" });
      el.classList.add("is-hash-target");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => el.classList.remove("is-hash-target"), 1600);
    }

    const frame = window.requestAnimationFrame(jump);
    window.addEventListener("hashchange", jump);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", jump);
    };
  }, []);

  return null;
}
