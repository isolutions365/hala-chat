import React, { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon } from 'lucide-react';

export interface LazyImageProps {
  src?: string | null;
  alt: string;
  aspectRatio?: string | number; // e.g., '1/1', '16/9', '4/3', 1, 1.33, 'auto'
  className?: string;
  containerClassName?: string;
  fallbackNode?: React.ReactNode;
  objectFit?: 'cover' | 'contain' | 'fill' | 'none';
  loading?: 'lazy' | 'eager';
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
  draggable?: boolean;
}

/**
 * LazyImage component
 * Features:
 * 1. Reserved CSS aspect-ratio box to eliminate Cumulative Layout Shift (CLS).
 * 2. Blurred loading placeholder state with transition on image load.
 * 3. Native loading="lazy" + IntersectionObserver threshold for performance on slow mobile networks.
 * 4. Graceful error fallback state.
 */
export const LazyImage: React.FC<LazyImageProps> = ({
  src,
  alt,
  aspectRatio = '1/1',
  className = '',
  containerClassName = '',
  fallbackNode,
  objectFit = 'cover',
  loading = 'lazy',
  onClick,
  draggable = false,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isInView, setIsInView] = useState(loading === 'eager');
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Reset states when src changes
  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
  }, [src]);

  // IntersectionObserver to defer loading until near viewport
  useEffect(() => {
    if (loading === 'eager' || isInView || !containerRef.current) return;

    if (!('IntersectionObserver' in window)) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      { rootMargin: '200px 0px' } // Pre-load when 200px from viewport
    );

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [loading, isInView]);

  // CSS aspect ratio value
  const parsedAspectRatio =
    typeof aspectRatio === 'number'
      ? `${aspectRatio}`
      : aspectRatio === 'auto'
      ? undefined
      : aspectRatio;

  const objectFitClass =
    objectFit === 'cover'
      ? 'object-cover'
      : objectFit === 'contain'
      ? 'object-contain'
      : objectFit === 'fill'
      ? 'object-fill'
      : 'object-none';

  // If no source or error occurred, render fallback
  if (!src || hasError) {
    return (
      <div
        ref={containerRef}
        onClick={onClick}
        className={`relative overflow-hidden flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 ${containerClassName}`}
        style={parsedAspectRatio ? { aspectRatio: parsedAspectRatio } : undefined}
      >
        {fallbackNode || (
          <div className="flex flex-col items-center justify-center p-2 text-slate-400">
            <ImageIcon className="w-5 h-5 opacity-60" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      className={`relative overflow-hidden bg-slate-100 dark:bg-slate-800/80 ${containerClassName}`}
      style={parsedAspectRatio ? { aspectRatio: parsedAspectRatio } : undefined}
    >
      {/* Skeleton Shimmer & Blur Placeholder during loading */}
      {!isLoaded && (
        <div className="absolute inset-0 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 animate-pulse backdrop-blur-md z-10 flex items-center justify-center">
          <div className="w-full h-full bg-slate-300/30 dark:bg-slate-700/30 backdrop-blur-xs" />
        </div>
      )}

      {/* Actual Image Element */}
      {isInView && (
        <img
          src={src}
          alt={alt}
          loading={loading}
          draggable={draggable}
          referrerPolicy="no-referrer"
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          className={`w-full h-full ${objectFitClass} transition-all duration-300 ease-out ${
            isLoaded
              ? 'opacity-100 blur-0 scale-100'
              : 'opacity-0 blur-md scale-105'
          } ${className}`}
        />
      )}
    </div>
  );
};
