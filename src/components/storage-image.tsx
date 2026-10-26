"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { IMAGE_BUCKET } from "@/lib/images/validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Props = { path: string | null; alt: string; width: number; height: number; className?: string };

/** Downloads only after entering the viewport; Storage RLS authorizes each request. */
export function StorageImage({ path, alt, width, height, className }: Props) {
  const container = useRef<HTMLSpanElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!path || !container.current) return;
    let active = true;
    let objectUrl: string | null = null;
    const load = async () => {
      const supabase = createSupabaseBrowserClient();
      if (!supabase) { if (active) setFailed(true); return; }
      const { data, error } = await supabase.storage.from(IMAGE_BUCKET).download(path);
      if (!active) return;
      if (error || !data) { setFailed(true); return; }
      objectUrl = URL.createObjectURL(data);
      setSource(objectUrl);
    };
    if (typeof IntersectionObserver === "undefined") void load();
    else {
      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); void load(); }
      }, { rootMargin: "160px" });
      observer.observe(container.current);
      return () => { active = false; observer.disconnect(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
    }
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path]);

  return <span ref={container} className={className} aria-busy={!source && !failed}>
    {source ? <Image unoptimized src={source} alt={alt} width={width} height={height} /> : failed ? <span className="photo-unavailable" role="img" aria-label="Imagen no disponible">Imagen no disponible</span> : <span className="photo-image-placeholder" aria-hidden="true" />}
  </span>;
}
