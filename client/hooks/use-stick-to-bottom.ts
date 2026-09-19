"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** Distance from the bottom, in px, still counted as "at the bottom". */
const PINNED_THRESHOLD_PX = 56;

export interface StickToBottom {
  /** Attach to the scrollable viewport. */
  readonly viewportRef: RefObject<HTMLDivElement | null>;
  /** Attach to the element that grows as content arrives. */
  readonly contentRef: RefObject<HTMLDivElement | null>;
  /** False once the reader has scrolled up — auto-scroll then stays out of the way. */
  readonly isPinned: boolean;
  readonly scrollToBottom: (behavior?: ScrollBehavior) => void;
}

/**
 * Follows streaming content without fighting the reader.
 *
 * A `ResizeObserver` on the content element drives the follow, so growth from a
 * single streamed token is tracked without deriving a React dependency from the
 * message text. The moment the reader scrolls away from the bottom the follow
 * stops, and it resumes only when they return (or press "jump to latest").
 */
export function useStickToBottom(): StickToBottom {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);
  const [isPinned, setIsPinned] = useState(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const viewport = viewportRef.current;
    if (viewport === null) {
      return;
    }
    pinnedRef.current = true;
    setIsPinned(true);
    viewport.scrollTo({ top: viewport.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) {
      return;
    }

    const syncPinned = (): void => {
      const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      const pinned = distance <= PINNED_THRESHOLD_PX;
      if (pinnedRef.current !== pinned) {
        pinnedRef.current = pinned;
        setIsPinned(pinned);
      }
    };

    viewport.addEventListener("scroll", syncPinned, { passive: true });
    syncPinned();
    return () => {
      viewport.removeEventListener("scroll", syncPinned);
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (viewport === null || content === null || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (!pinnedRef.current) {
        return;
      }
      // `auto` on purpose: a smooth animation per token would never settle, and
      // it would ignore `prefers-reduced-motion`.
      viewport.scrollTop = viewport.scrollHeight;
    });
    observer.observe(content);
    return () => {
      observer.disconnect();
    };
  }, []);

  return { viewportRef, contentRef, isPinned, scrollToBottom };
}
