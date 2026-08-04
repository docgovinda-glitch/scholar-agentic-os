/**
 * Service Worker registration and update hooks for Pocket PWA.
 * Handles SW registration, update detection, and push notification permissions.
 */

import { useEffect, useState } from "react";

interface ServiceWorkerState {
  ready: boolean;
  updating: boolean;
  error: Error | null;
}

/**
 * Register service worker and listen for updates.
 * On update available, shows reload prompt to user.
 */
export function useServiceWorkerRegistration(): ServiceWorkerState {
  const [state, setState] = useState<ServiceWorkerState>({
    ready: false,
    updating: false,
    error: null,
  });

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      setState((prev) => ({
        ...prev,
        error: new Error("Service Workers not supported"),
      }));
      return;
    }

    let registration: ServiceWorkerRegistration | null = null;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        registration = reg;
        setState((prev) => ({ ...prev, ready: true }));

        // Listen for updates
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;

          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              setState((prev) => ({ ...prev, updating: true }));

              // Notify user of update available
              if (window.confirm("New version available! Reload to update?")) {
                newWorker.postMessage({ type: "SKIP_WAITING" });
                window.location.reload();
              }
            }
          });
        });
      })
      .catch((error) => {
        console.error("[SW] Registration failed:", error);
        setState((prev) => ({ ...prev, error }));
      });

    // Handle controller change (SW became active)
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      console.log("[SW] New service worker became active");
    });

    return () => {
      // Cleanup if needed
    };
  }, []);

  return state;
}

/**
 * Request push notification permission and subscribe to push events.
 */
export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );
  const [subscriptionError, setSubscriptionError] = useState<Error | null>(null);

  const requestPermission = async () => {
    if (!("Notification" in window)) {
      setSubscriptionError(new Error("Notifications not supported"));
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === "granted") {
        await subscribeToPushNotifications();
        return true;
      }
      return false;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      setSubscriptionError(err);
      return false;
    }
  };

  const subscribeToPushNotifications = async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setSubscriptionError(
        new Error("Push notifications not supported")
      );
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        console.log("[Push] Already subscribed");
        return;
      }

      // Note: This requires a valid VAPID public key from server
      // For now, just log that subscription would happen
      console.log("[Push] Ready to subscribe (VAPID key required from server)");
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      setSubscriptionError(err);
    }
  };

  return {
    permission,
    error: subscriptionError,
    requestPermission,
  };
}

/**
 * Check if app is installable and handle install prompt.
 */
export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setPromptEvent(e);
      console.log("[PWA] Install prompt available");
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      console.log("[PWA] App installed");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!promptEvent) {
      console.log("[PWA] Install prompt not available");
      return false;
    }

    try {
      promptEvent.prompt();
      const result = await promptEvent.userChoice;
      console.log("[PWA] User response:", result.outcome);
      setPromptEvent(null);
      return result.outcome === "accepted";
    } catch (error) {
      console.error("[PWA] Install failed:", error);
      return false;
    }
  };

  return {
    canInstall: Boolean(promptEvent),
    isInstalled: installed,
    install,
  };
}
