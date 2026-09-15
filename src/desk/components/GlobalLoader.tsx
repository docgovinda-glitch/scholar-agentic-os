import GlobalLoadingOverlay from "./GlobalLoadingOverlay";

export default function GlobalLoader({
  message = "Loading Scholar Core...",
}: {
  message?: string;
}) {
  return <GlobalLoadingOverlay active={true} message={message} />;
}
