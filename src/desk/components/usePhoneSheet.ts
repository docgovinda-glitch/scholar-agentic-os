import { useEffect, useState } from "react";

const PHONE_QUERY = "(max-width: 639px)";

/**
 * True on phone-width screens. Ask Scholar's popovers switch to a bottom
 * sheet there: anchored to the trigger they run off the screen edge or under
 * the header, so on a phone they are rendered as a sheet pinned to the
 * viewport instead.
 */
export function useIsPhoneSheet(): boolean {
  const canMatch = () => typeof window !== "undefined" && typeof window.matchMedia === "function";
  const [phone, setPhone] = useState(() => (canMatch() ? window.matchMedia(PHONE_QUERY).matches : false));

  useEffect(() => {
    if (!canMatch()) return;
    const mq = window.matchMedia(PHONE_QUERY);
    const onChange = () => setPhone(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return phone;
}

/** Classes for a popover panel: a bottom sheet on phones, the anchored popover elsewhere. */
export const PHONE_SHEET_CLASSES = "fixed inset-x-3 bottom-3 z-[70] max-h-[70vh] overflow-y-auto overscroll-contain shadow-2xl";
