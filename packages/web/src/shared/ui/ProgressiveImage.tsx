import { type ImgHTMLAttributes, useEffect, useRef, useState } from "react";

type ProgressiveImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "alt" | "loading" | "src"
> & {
  alt: string;
  priority?: boolean;
  rootMargin?: string;
  src: string;
};

export function ProgressiveImage({
  priority = false,
  rootMargin = "400px 0px",
  src,
  alt,
  ...props
}: ProgressiveImageProps) {
  const imageRef = useRef<HTMLImageElement>(null);
  const [shouldLoad, setShouldLoad] = useState(priority);

  useEffect(() => {
    if (priority) {
      setShouldLoad(true);
      return;
    }

    const image = imageRef.current;
    if (!image) return;

    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin, threshold: 0 },
    );
    observer.observe(image);

    return () => observer.disconnect();
  }, [priority, rootMargin]);

  return (
    <img
      {...props}
      alt={alt}
      ref={imageRef}
      src={shouldLoad ? src : undefined}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
