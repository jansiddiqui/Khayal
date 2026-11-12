import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchPhotoBlob } from "../api/client";

interface AuthedImageProps {
  /** Photo path under /api, from the family API. */
  src: string;
  alt: string;
  className?: string;
}

/**
 * Shows a private photo. It is downloaded with the login token (photos are never public
 * URLs) and displayed from an in-memory object URL that is released when unmounted.
 */
export function AuthedImage({ src, alt, className = "" }: AuthedImageProps) {
  const blob = useQuery({ queryKey: ["photo", src], queryFn: () => fetchPhotoBlob(src), staleTime: Infinity });
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob.data) return;
    const url = URL.createObjectURL(blob.data);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob.data]);

  if (!objectUrl) {
    return <div role="img" aria-label={alt} aria-busy={blob.isPending} className={`bg-sunken ${className}`} />;
  }
  return <img src={objectUrl} alt={alt} className={className} />;
}
